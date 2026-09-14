@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "一斉反映アプリ（このウィンドウは閉じないでください）" cmd /k node server.js
timeout /t 2 >nul
start "" "http://localhost:4173/"
