@echo off

echo Installing Node.js dependencies...
call npm install @firebase/auth@1.4.0 @firebase/database@1.0.4 axios@1.6.8 bcryptjs@2.4.3 bootstrap@5.3.3 bootstrap-icons@1.11.3 cookie-parser@1.4.6 datatables.net-dt@2.0.3 driver.js@1.3.1 ejs@3.1.9 excel4node@1.8.2 express@4.19.2 firebase@10.6.0 firebase-admin@12.0.0 form-data@4.0.0 jquery@3.7.1 multer@1.4.5-lts.1 nodemailer@6.9.13 path@0.12.7 react-top-loading-bar@2.3.1 sweetalert@2.1.2 sweetalert2@11.6.13 uuid@9.0.1 xlsx@0.18.5

echo Installing Dart dependencies...
call flutter pub get firebase_auth@4.2.10 firebase_database@9.0.12 cloud_firestore@4.4.12 http^6.1.3 crypto^3.0.1 path_provider^2.0.11 share_plus^6.3.0

echo Installing Python dependencies...
call pip install google-cloud-firestore==7.6.0

echo Done!
pause