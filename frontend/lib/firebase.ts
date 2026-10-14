import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import type { Alert } from "@/lib/types";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "sentrix-41ecc.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sentrix-41ecc",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "sentrix-41ecc.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "983794620252",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:983794620252:web:63ab9fd6fd9e6bd29e5399",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-71W5EFZCWG",
};

let appInstance: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);
}

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (!isFirebaseConfigured()) return null;

  if (!appInstance) {
    const existing = getApps();
    appInstance = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return appInstance;
}

export function getFirestoreDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!authInstance) {
    authInstance = getAuth(app);
  }
  return authInstance;
}

/**
 * Real-time listener for operational alerts in Firestore.
 * Subscribes to the "alerts" collection ordered by timestamp descending.
 */
export function subscribeToAlerts(
  onUpdate: (alerts: Alert[]) => void,
  onError?: (error: Error) => void
): Unsubscribe | null {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const alertsQuery = query(collection(db, "alerts"), orderBy("timestamp", "desc"));
    return onSnapshot(
      alertsQuery,
      (snapshot) => {
        const alerts: Alert[] = [];
        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data() as Alert;
          alerts.push({
            ...data,
            id: data.id || docSnapshot.id,
          });
        });
        onUpdate(alerts);
      },
      (error) => {
        if (onError) onError(error);
      }
    );
  } catch (err) {
    if (onError && err instanceof Error) onError(err);
    return null;
  }
}

/**
 * Persist or update an operational alert directly to Firestore.
 */
export async function saveAlertToFirestore(alert: Alert): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !alert.id) return false;

  try {
    const docRef = doc(db, "alerts", alert.id);
    await setDoc(docRef, { ...alert, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch (err) {
    console.warn("Firestore saveAlert failed:", err);
    return false;
  }
}

/**
 * Record an immutable audit log entry in the alerts_events collection.
 */
export async function recordAlertEventToFirestore(alert: Alert, eventType: string = "client_acknowledged"): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !alert.id) return false;

  try {
    const eventId = `${alert.id}:${Date.now()}`;
    const docRef = doc(db, "alerts_events", eventId);
    await setDoc(docRef, {
      eventId,
      alertId: alert.id,
      eventType,
      alert,
      recordedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.warn("Firestore recordAlertEvent failed:", err);
    return false;
  }
}
