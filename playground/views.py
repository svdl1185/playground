from django.shortcuts import render

# Create your views here.

def home(request):
    return render(request, 'home.html')

def playground(request):
    return render(request, 'playground.html')
