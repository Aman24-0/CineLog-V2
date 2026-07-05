// src/core/firebase/auth.ts
import {
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

import { auth, googleProvider } from "./config";

export const login = () =>
  signInWithRedirect(auth, googleProvider);

export const completeRedirectLogin = () =>
  getRedirectResult(auth);

export const logout = () =>
  signOut(auth);

export { onAuthStateChanged };
