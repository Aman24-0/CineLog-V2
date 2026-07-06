// src/core/firebase/config.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { isServer } from "solid-js/web";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

// Auth initialization must be skipped on the server.
// getAuth() validates VITE_FIREBASE_API_KEY eagerly — if the env var is
// missing (e.g. dev without a .env file, or SSR build without secrets),
// it throws `auth/invalid-api-key` and crashes every SSR route with 503.
//
// All consumers of `auth` only touch it inside onMount / event handlers
// (which never run during SSR), so a null placeholder on the server is safe.
let _auth: ReturnType<typeof getAuth> | null = null;
let _provider: GoogleAuthProvider | null = null;

if (!isServer) {
  _auth = getAuth(app);
  _provider = new GoogleAuthProvider();
  _provider.setCustomParameters({ prompt: "select_account" });
}

export const auth = _auth as NonNullable<typeof _auth>;
export const googleProvider = _provider as NonNullable<typeof _provider>;
