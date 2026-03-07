// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "test-api-key",
    authDomain: "test-project-id.firebaseapp.com",
    projectId: "test-project-id",
    storageBucket: "test-project-id.firebasestorage.app",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:1234567890abcdef",
    measurementId: "G-12345ABCDE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
