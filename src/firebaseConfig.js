import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCa_4nUh2ABbrWQV2ybFYQ6LUu7ZaQbiLg',
  authDomain: 'walk-nepal-walk.firebaseapp.com',
  projectId: 'walk-nepal-walk',
  storageBucket: 'walk-nepal-walk.firebasestorage.app',
  messagingSenderId: '1066461909049',
  appId: '1:1066461909049:web:372d0d25dd58dcbab3fde8',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export { signInWithPopup, signOut };
