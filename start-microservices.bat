@echo off
echo Starting IndraSuite Microservices...
echo.

start "API Gateway" cmd /k "cd services\api-gateway && npm run dev"
timeout /t 2 /nobreak >nul

start "Auth Service" cmd /k "cd services\auth-service && npm run dev"
timeout /t 2 /nobreak >nul

start "AWS Service" cmd /k "cd services\aws-service && npm run dev"
timeout /t 2 /nobreak >nul

start "Deployment Service" cmd /k "cd services\deployment-service && npm run dev"
timeout /t 2 /nobreak >nul

start "Notification Service" cmd /k "cd services\notification-service && npm run dev"
timeout /t 2 /nobreak >nul

echo.
echo ✅ All services started!
echo.
echo Services running on:
echo - API Gateway:         http://localhost:5000
echo - Auth Service:        http://localhost:5001
echo - AWS Service:         http://localhost:5002
echo - Deployment Service:  http://localhost:5003
echo - Notification Service: http://localhost:5004
echo.
pause
