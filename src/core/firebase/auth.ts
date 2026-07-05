import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

import { auth, googleProvider } from "./config";

export const login = () =>
  signInWithPopup(auth, googleProvider);

export const logout = () =>
  signOut(auth);

export { onAuthStateChanged };
