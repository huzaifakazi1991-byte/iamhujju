import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  query,
  orderBy,
  getDocs,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAMKRuMTAuRncHciJB3NGVmepmyh9BF7cY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'iamhujju-680e8.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'iamhujju-680e8',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'iamhujju-680e8.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1071730198353',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1071730198353:web:298b63b8db74152828f570',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-69KG8HMRSH'
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId
);

const app = !getApps().length
  ? (isFirebaseConfigured ? initializeApp(firebaseConfig) : null)
  : getApp();

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Authentication helpers
export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase Authentication is not configured yet. Please add your Firebase credentials.');
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function registerWithEmail(email, password) {
  if (!auth) throw new Error('Firebase Authentication is not configured yet. Please add your Firebase credentials.');
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function loginWithEmail(email, password) {
  if (!auth) throw new Error('Firebase Authentication is not configured yet. Please add your Firebase credentials.');
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function logoutFirebase() {
  if (!auth) return;
  await signOut(auth);
}

export function subscribeToAuthChanges(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

// Cloud Firestore Conversation & User Storage Helpers
export async function syncUserProfile(user) {
  if (!db || !user) return;
  const userRef = doc(db, 'users', user.uid);
  await setDoc(userRef, {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email?.split('@')[0] || 'User',
    photoURL: user.photoURL || null,
    tier: 'free',
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function saveConversationToFirestore(userId, conversation) {
  if (!db || !userId || !conversation?.id) return;
  const convRef = doc(db, 'users', userId, 'conversations', String(conversation.id));
  await setDoc(convRef, {
    id: String(conversation.id),
    title: conversation.title || 'New conversation',
    model: conversation.model || 'auto',
    messages: conversation.messages || [],
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function loadConversationsFromFirestore(userId) {
  if (!db || !userId) return [];
  const q = query(
    collection(db, 'users', userId, 'conversations'),
    orderBy('updatedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

export async function deleteConversationFromFirestore(userId, conversationId) {
  if (!db || !userId || !conversationId) return;
  const convRef = doc(db, 'users', userId, 'conversations', String(conversationId));
  await deleteDoc(convRef);
}
