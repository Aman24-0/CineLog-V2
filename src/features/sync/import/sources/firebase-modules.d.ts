// src/features/sync/import/sources/firebase-modules.d.ts
//
// Type declarations for the firebase dynamic imports used by the V1
// migration engine.
//
// Firebase is an OPTIONAL peer dependency — it's only needed when a user
// actually starts a CineLog V1 migration. We dynamically import it so
// V2 doesn't bundle the firebase SDK for users who never migrate.
//
// These declarations let TypeScript type-check the dynamic imports
// without requiring the firebase package to be installed. At runtime,
// if firebase isn't installed, the import rejects and the migration
// engine surfaces a helpful error.

declare module "firebase/app" {
  export interface FirebaseApp {
    name: string;
    options: Record<string, unknown>;
  }
  export interface FirebaseOptions {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
  }
  export function initializeApp(options: FirebaseOptions, name?: string): FirebaseApp;
  export function getApp(name?: string): FirebaseApp;
  const _default: { initializeApp: typeof initializeApp; getApp: typeof getApp };
  export default _default;
}

declare module "firebase/auth" {
  import type { FirebaseApp } from "firebase/app";
  export interface User {
    uid: string;
    email: string | null;
  }
  export interface UserCredential {
    user: User;
  }
  export interface Auth {
    app: FirebaseApp;
  }
  export function getAuth(app: FirebaseApp): Auth;
  export function signInWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<UserCredential>;
  const _default: { getAuth: typeof getAuth; signInWithEmailAndPassword: typeof signInWithEmailAndPassword };
  export default _default;
}

declare module "firebase/firestore" {
  import type { FirebaseApp } from "firebase/app";
  export interface Firestore {
    app: FirebaseApp;
  }
  export interface DocumentData {
    [key: string]: unknown;
  }
  export interface QueryDocumentSnapshot {
    data(): DocumentData;
  }
  export interface QuerySnapshot {
    forEach(callback: (snapshot: QueryDocumentSnapshot) => void): void;
  }
  export interface Query {
    // opaque query type
  }
  export interface CollectionReference {
    // opaque collection reference
  }
  export function getFirestore(app: FirebaseApp): Firestore;
  export function collection(db: Firestore, ...path: string[]): CollectionReference;
  export function query(collectionRef: CollectionReference): Query;
  export function getDocs(q: Query): Promise<QuerySnapshot>;
  const _default: {
    getFirestore: typeof getFirestore;
    collection: typeof collection;
    query: typeof query;
    getDocs: typeof getDocs;
  };
  export default _default;
}
