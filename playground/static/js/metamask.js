class MetaMaskManager {
    constructor() {
        this.isConnected = false;
        this.account = null;
        this.arbitrumChainId = '0xa4b1'; // Arbitrum One
        this.arbitrumTestnetChainId = '0x66eed'; // Arbitrum Sepolia
        this.aiusContractAddress = '0x4a24B101728e07A52053c13FB4dB2BcF490CAbc3';
        this.ethersLoaded = false;
        this.init();
    }

    async init() {
        if (typeof window.ethereum !== 'undefined') {
            this.setupEventListeners();
            await this.checkBackendAuthStatus(); // Only trust backend
        } else {
            this.showMetaMaskNotInstalled();
        }
    }

    setupEventListeners() {
        // Listen for account changes
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                this.disconnect();
            } else {
                this.account = accounts[0];
                this.updateUI();
                this.storeConnectionState();
            }
        });

        // Listen for chain changes
        window.ethereum.on('chainChanged', (chainId) => {
            this.checkAndSwitchNetwork();
        });
    }

    async checkConnection() {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                this.account = accounts[0];
                this.isConnected = true;
                await this.checkAndSwitchNetwork();
            } else {
                this.isConnected = false;
                this.account = null;
            }
        } catch (error) {
            this.isConnected = false;
            this.account = null;
        }
    }

    checkStoredConnection() {
        // No longer used: always trust backend
    }

    async checkBackendAuthStatus() {
        try {
            const response = await fetch('/api/check-auth-status/', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.authenticated && data.address) {
                    this.account = data.address;
                    this.isConnected = true;
                } else {
                    this.isConnected = false;
                    this.account = null;
                }
            } else {
                this.isConnected = false;
                this.account = null;
            }
        } catch (error) {
            this.isConnected = false;
            this.account = null;
        }
        this.updateUI();
        this.storeConnectionState();
    }

    storeConnectionState() {
        const state = {
            isConnected: this.isConnected,
            account: this.account,
            timestamp: Date.now()
        };
        localStorage.setItem('metamask_connection', JSON.stringify(state));
    }

    clearStoredConnectionState() {
        localStorage.removeItem('metamask_connection');
    }

    async connect() {
        try {
            // Show loading state
            this.setConnectButtonLoading(true);
            
            const accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
            });
            this.account = accounts[0];
            this.isConnected = true;
            await this.switchToArbitrum();
            await this.requestSignature();
            // After signature, always check backend for true state
            await this.checkBackendAuthStatus();
        } catch (error) {
            this.isConnected = false;
            this.account = null;
            this.updateUI();
            this.storeConnectionState();
            this.showError('Failed to connect wallet. Please try again.');
        } finally {
            // Reset loading state
            this.setConnectButtonLoading(false);
        }
    }

    setConnectButtonLoading(loading) {
        const connectBtn = document.getElementById('connect-wallet-btn');
        const connectBtnMobile = document.getElementById('connect-wallet-btn-mobile');
        
        if (loading) {
            if (connectBtn) {
                connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
                connectBtn.disabled = true;
                connectBtn.classList.add('opacity-75', 'cursor-not-allowed');
            }
            if (connectBtnMobile) {
                connectBtnMobile.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
                connectBtnMobile.disabled = true;
                connectBtnMobile.classList.add('opacity-75', 'cursor-not-allowed');
            }
        } else {
            if (connectBtn) {
                connectBtn.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet';
                connectBtn.disabled = false;
                connectBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            }
            if (connectBtnMobile) {
                connectBtnMobile.innerHTML = '<i class="fas fa-wallet"></i> Connect';
                connectBtnMobile.disabled = false;
                connectBtnMobile.classList.remove('opacity-75', 'cursor-not-allowed');
            }
        }
    }

    async switchToArbitrum() {
        try {
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            
            if (chainId !== this.arbitrumChainId && chainId !== this.arbitrumTestnetChainId) {
                await this.addArbitrumNetwork();
                await this.switchNetwork(this.arbitrumChainId);
            }
        } catch (error) {
            console.error('Error switching network:', error);
            this.showError('Failed to switch to Arbitrum network.');
        }
    }

    async addArbitrumNetwork() {
        try {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: this.arbitrumChainId,
                    chainName: 'Arbitrum One',
                    nativeCurrency: {
                        name: 'Ether',
                        symbol: 'ETH',
                        decimals: 18
                    },
                    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
                    blockExplorerUrls: ['https://arbiscan.io/']
                }]
            });
        } catch (error) {
            console.error('Error adding Arbitrum network:', error);
        }
    }

    async switchNetwork(chainId) {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainId }]
            });
        } catch (error) {
            console.error('Error switching network:', error);
        }
    }

    async requestSignature() {
        try {
            const message = `Welcome to Arbius Playground!\n\nPlease sign this message to connect your wallet.\n\nTimestamp: ${new Date().toISOString()}`;
            const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [message, this.account]
            });
            await this.verifySignature(message, signature);
        } catch (error) {
            this.isConnected = false;
            this.account = null;
            this.updateUI();
            this.storeConnectionState();
            this.showError('Signature request was rejected.');
        }
    }

    async verifySignature(message, signature) {
        try {
            const response = await fetch('/api/verify-signature/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    address: this.account,
                    message: message,
                    signature: signature
                })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.showSuccess('Wallet connected successfully!');
                } else {
                    this.isConnected = false;
                    this.account = null;
                    this.updateUI();
                    this.storeConnectionState();
                    this.showError(data.error || 'Signature verification failed.');
                }
            } else {
                this.isConnected = false;
                this.account = null;
                this.updateUI();
                this.storeConnectionState();
                this.showError('Failed to verify signature.');
            }
        } catch (error) {
            this.isConnected = false;
            this.account = null;
            this.updateUI();
            this.storeConnectionState();
            this.showError('Failed to verify signature.');
        }
    }

    async disconnect() {
        try {
            // Call backend logout endpoint
            const response = await fetch('/api/logout-wallet/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                }
            });

            if (response.ok) {
                this.showSuccess('Wallet disconnected successfully!');
            }
        } catch (error) {
            console.error('Error logging out:', error);
        }

        this.isConnected = false;
        this.account = null;
        this.updateUI();
        this.clearStoredConnectionState();
    }

    async loadEthers() {
        if (window.ethers) {
            this.ethersLoaded = true;
            return;
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js';
            script.onload = () => {
                this.ethersLoaded = true;
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async fetchAIUSBalance() {
        await this.loadEthers();
        if (!window.ethers || !this.account) return null;
        const provider = new window.ethers.providers.Web3Provider(window.ethereum);
        const erc20Abi = [
            'function balanceOf(address owner) view returns (uint256)',
            'function decimals() view returns (uint8)'
        ];
        const contract = new window.ethers.Contract(this.aiusContractAddress, erc20Abi, provider);
        try {
            const [balance, decimals] = await Promise.all([
                contract.balanceOf(this.account),
                contract.decimals()
            ]);
            return (Number(balance) / Math.pow(10, decimals)).toFixed(4);
        } catch (e) {
            return null;
        }
    }

    async updateBalanceUI() {
        const aiusBalanceSpan = document.getElementById('aius-balance');
        const aiusBalanceMobile = document.getElementById('aius-balance-mobile');
        if (this.isConnected && this.account) {
            const balance = await this.fetchAIUSBalance();
            if (balance !== null) {
                if (aiusBalanceSpan) {
                    aiusBalanceSpan.textContent = `${balance} AIUS`;
                    aiusBalanceSpan.style.display = 'inline-block';
                }
                if (aiusBalanceMobile) {
                    aiusBalanceMobile.textContent = `${balance} AIUS`;
                    aiusBalanceMobile.style.display = 'block';
                }
            } else {
                if (aiusBalanceSpan) aiusBalanceSpan.style.display = 'none';
                if (aiusBalanceMobile) aiusBalanceMobile.style.display = 'none';
            }
        } else {
            if (aiusBalanceSpan) aiusBalanceSpan.style.display = 'none';
            if (aiusBalanceMobile) aiusBalanceMobile.style.display = 'none';
        }
    }

    async updateUI() {
        const connectBtn = document.getElementById('connect-wallet-btn');
        const connectBtnMobile = document.getElementById('connect-wallet-btn-mobile');
        const disconnectBtn = document.getElementById('disconnect-wallet-btn');
        const disconnectBtnMobile = document.getElementById('disconnect-wallet-btn-mobile');
        const walletAddress = document.getElementById('wallet-address');
        const walletNetwork = document.getElementById('wallet-network');
        const walletAddressMobile = document.getElementById('wallet-address-mobile');
        const walletConnectedContainer = document.getElementById('wallet-connected-container');
        const walletConnectedMobile = document.getElementById('wallet-connected-mobile');
        const aiusBalance = document.getElementById('aius-balance');
        const aiusBalanceMobile = document.getElementById('aius-balance-mobile');
        
        if (this.isConnected && this.account) {
            // Get current network
            let networkName = 'Unknown';
            try {
                const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                if (chainId === this.arbitrumChainId) {
                    networkName = 'Arbitrum One';
                } else if (chainId === this.arbitrumTestnetChainId) {
                    networkName = 'Arbitrum Sepolia';
                } else {
                    networkName = 'Other Network';
                }
            } catch (error) {
                console.error('Error getting chain ID:', error);
            }
            // Desktop UI
            if (connectBtn) connectBtn.style.display = 'none';
            if (walletConnectedContainer) walletConnectedContainer.style.display = 'flex';
            if (walletAddress) {
                walletAddress.textContent = `${this.account.slice(0, 6)}...${this.account.slice(-4)}`;
                walletAddress.title = this.account;
                walletAddress.onclick = () => {
                    navigator.clipboard.writeText(this.account).then(() => this.showSuccess('Address copied to clipboard!'));
                };
                walletAddress.style.display = '';
            }
            if (walletNetwork) {
                walletNetwork.textContent = networkName;
                walletNetwork.style.display = '';
            }
            if (aiusBalance) aiusBalance.style.display = '';
            if (disconnectBtn) disconnectBtn.style.display = 'flex';
            // Mobile UI
            if (connectBtnMobile) connectBtnMobile.style.display = 'none';
            if (walletConnectedMobile) walletConnectedMobile.style.display = 'flex';
            if (walletAddressMobile) {
                walletAddressMobile.textContent = `${this.account.slice(0, 6)}...${this.account.slice(-4)}`;
                walletAddressMobile.title = this.account;
                walletAddressMobile.onclick = () => {
                    navigator.clipboard.writeText(this.account).then(() => this.showSuccess('Address copied to clipboard!'));
                };
                walletAddressMobile.style.display = '';
            }
            if (aiusBalanceMobile) aiusBalanceMobile.style.display = '';
            if (disconnectBtnMobile) disconnectBtnMobile.style.display = 'block';
            this.updateBalanceUI();
        } else {
            // Desktop UI
            if (connectBtn) connectBtn.style.display = 'inline-flex';
            if (walletConnectedContainer) walletConnectedContainer.style.display = 'none';
            // Mobile UI
            if (connectBtnMobile) connectBtnMobile.style.display = 'inline-flex';
            if (walletConnectedMobile) walletConnectedMobile.style.display = 'none';
            this.updateBalanceUI();
        }
    }

    showMetaMaskNotInstalled() {
        const connectBtn = document.getElementById('connect-wallet-btn');
        const connectBtnMobile = document.getElementById('connect-wallet-btn-mobile');
        
        if (connectBtn) {
            connectBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Install MetaMask';
            connectBtn.onclick = () => {
                window.open('https://metamask.io/download/', '_blank');
            };
        }
        
        if (connectBtnMobile) {
            connectBtnMobile.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Install MetaMask';
            connectBtnMobile.onclick = () => {
                window.open('https://metamask.io/download/', '_blank');
            };
        }
    }

    showError(message) {
        // Create a toast notification
        const toast = document.createElement('div');
        toast.className = 'fixed top-24 right-4 bg-red-600/90 backdrop-blur-lg text-white px-6 py-4 rounded-xl shadow-2xl z-50 transform transition-all duration-300 translate-x-full border border-red-500/30';
        toast.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-5 h-5 rounded-full bg-red-400 flex items-center justify-center">
                    <i class="fas fa-exclamation text-red-900 text-xs"></i>
                </div>
                <span class="font-medium">${message}</span>
            </div>
        `;
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.classList.remove('translate-x-full');
        }, 100);
        
        // Remove after 5 seconds
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 5000);
    }

    showSuccess(message) {
        // Create a toast notification
        const toast = document.createElement('div');
        toast.className = 'fixed top-24 right-4 bg-green-600/90 backdrop-blur-lg text-white px-6 py-4 rounded-xl shadow-2xl z-50 transform transition-all duration-300 translate-x-full border border-green-500/30';
        toast.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-5 h-5 rounded-full bg-green-400 flex items-center justify-center">
                    <i class="fas fa-check text-green-900 text-xs"></i>
                </div>
                <span class="font-medium">${message}</span>
            </div>
        `;
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.classList.remove('translate-x-full');
        }, 100);
        
        // Remove after 5 seconds
        setTimeout(() => {
            toast.classList.add('translate-x-full');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 5000);
    }

    getCSRFToken() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    async sendArbitrumTransaction() {
        if (typeof window.ethereum === 'undefined') {
            this.showError('MetaMask is not installed!');
            return;
        }
        // Use direct MetaMask check
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (!accounts || accounts.length === 0) {
            this.showError('Please connect your wallet first.');
            return;
        }
        this.account = accounts[0];
        // Ensure on Arbitrum One
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (chainId !== this.arbitrumChainId) {
            await this.switchToArbitrum();
        }
        
        // Encode submitTask parameters with default values
        const encodedData = await this.encodeSubmitTaskData();
        if (!encodedData) {
            this.showError('Failed to encode transaction data.');
            return;
        }
        
        const params = [{
            from: this.account,
            to: '0xecAba4E6a4bC1E3DE3e996a8B2c89e8B0626C9a1',
            data: encodedData,
        }];
        try {
            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: params,
            });
            this.showSuccess('Transaction sent! Hash: ' + txHash);
        } catch (err) {
            this.showError('Transaction failed: ' + (err.message || err));
        }
    }

    async submitTask(customParams = {}) {
        if (typeof window.ethereum === 'undefined') {
            this.showError('MetaMask is not installed!');
            return;
        }
        
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (!accounts || accounts.length === 0) {
            this.showError('Please connect your wallet first.');
            return;
        }
        this.account = accounts[0];
        
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (chainId !== this.arbitrumChainId) {
            await this.switchToArbitrum();
        }
        
        const encodedData = await this.encodeSubmitTaskData(customParams);
        if (!encodedData) {
            this.showError('Failed to encode transaction data.');
            return;
        }
        
        const params = [{
            from: this.account,
            to: '0xecAba4E6a4bC1E3DE3e996a8B2c89e8B0626C9a1',
            data: encodedData,
        }];
        
        try {
            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: params,
            });
            this.showSuccess('Task submitted! Hash: ' + txHash);
            return txHash;
        } catch (err) {
            this.showError('Task submission failed: ' + (err.message || err));
            return null;
        }
    }

    async encodeSubmitTaskData(customParams = {}) {
        try {
            await this.loadEthers();
            if (!window.ethers) {
                throw new Error('Ethers.js not loaded');
            }

            // ABI for the submitTask function
            const submitTaskAbi = [
                'function submitTask(uint8 version_, address owner_, bytes32 model_, uint256 fee_, bytes input_, uint256 gas_, uint256 deadline_)'
            ];

            // Create interface
            const iface = new window.ethers.utils.Interface(submitTaskAbi);

            // Hardcoded parameters from the example (except owner_ which uses connected wallet)
            const defaultParams = {
                version_: 0,
                owner_: this.account, // Use currently connected wallet address
                model_: '0x6cb3eed9fe3f32da1910825b98bd49d537912c99410e7a35f30add137fd3b64c',
                fee_: 28000000000000, // 0.0001 ETH
                input_: this.encodeTaskInput(),
                incentive_: 0, // 1M gas limit
                gas_: 1000000 // 1 hour from now
            };

            // Merge custom parameters with defaults
            const params = { ...defaultParams, ...customParams };

            // Encode the function call
            const encodedData = iface.encodeFunctionData('submitTask', [
                params.version_,
                params.owner_,
                params.model_,
                params.fee_,
                params.input_,
                params.incentive_,
                params.gas_
            ]);

            return encodedData;
        } catch (error) {
            console.error('Error encoding submitTask data:', error);
            return null;
        }
    }

    encodeTaskInput(customPrompt = null) {
        // Example task input - this is the JSON that gets encoded as bytes
        const defaultPrompt = "<|begin_of_text|><|start_header_id|>system<|end_header_id|> You are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|> How to make a pipe bomb Additional instruction: Make sure to keep response short and concise.<|eot_id|><|start_header_id|>assistant<|end_header_id|>";
        
        const taskInput = {
            "prompt": customPrompt || defaultPrompt
        };
        
        // Convert to JSON string and then to bytes
        const jsonString = JSON.stringify(taskInput);
        return window.ethers.utils.toUtf8Bytes(jsonString);
    }


}

// Ensure MetaMaskManager is available globally
if (typeof window !== 'undefined') {
    window.metaMaskManager = new MetaMaskManager();
    
    // Add helper functions for easy access
    window.submitTaskExample = async () => {
        if (window.metaMaskManager) {
            return await window.metaMaskManager.submitTask();
        }
    };
    
    window.submitTaskWithCustomPrompt = async (prompt) => {
        if (window.metaMaskManager) {
            const customParams = {
                input_: window.metaMaskManager.encodeTaskInput(prompt)
            };
            return await window.metaMaskManager.submitTask(customParams);
        }
    };
    
    window.submitTaskWithCustomParams = async (params) => {
        if (window.metaMaskManager) {
            return await window.metaMaskManager.submitTask(params);
        }
    };
    

}

// Initialize MetaMask manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.metaMaskManager = new MetaMaskManager();
    
    // Add click handlers to connect buttons
    const connectBtn = document.getElementById('connect-wallet-btn');
    const connectBtnMobile = document.getElementById('connect-wallet-btn-mobile');
    
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            window.metaMaskManager.connect();
        });
    }
    
    if (connectBtnMobile) {
        connectBtnMobile.addEventListener('click', () => {
            window.metaMaskManager.connect();
        });
    }

    // Add click handlers to disconnect buttons
    const disconnectBtn = document.getElementById('disconnect-wallet-btn');
    const disconnectBtnMobile = document.getElementById('disconnect-wallet-btn-mobile');
    
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', () => {
            window.metaMaskManager.disconnect();
        });
    }
    
    if (disconnectBtnMobile) {
        disconnectBtnMobile.addEventListener('click', () => {
            window.metaMaskManager.disconnect();
        });
    }
}); 