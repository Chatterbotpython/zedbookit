import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  connectAuthEmulator,
  type Auth,
  // @ts-ignore - getReactNativePersistence exists on the React Native build of
  // the Firebase JS SDK (resolved via the package's "react-native" field at
  // Metro bundle time) but isn't present in the Node/browser type defs tsc
  // resolves to when type-checking outside Metro.
  getReactNativePersistence,
} from "firebase/auth";
// @ts-ignore - no types shipped for the RN entry point, this is the documented Firebase import
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import {
  initializeFirestore,
  getFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  // Fail loudly in dev rather than silently hitting a misconfigured backend.
  console.warn(
    "[ZedBookIt] Firebase config is missing values. Copy .env.example to .env and fill in your Firebase project settings."
  );
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth: AsyncStorage-backed persistence on native (so sessions survive app
// restarts), default browser persistence on web. `initializeAuth` throws
// `auth/already-initialized` on a Fast Refresh / hot reload, so fall back to the
// already-created instance instead of crashing the app during development.
function createAuth(): Auth {
  if (Platform.OS === "web") return getAuth(firebaseApp);
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
}
export const auth: Auth = createAuth();

// Firestore.
//  - `ignoreUndefinedProperties`: the Firestore SDK throws "Unsupported field
//    value: undefined" for ANY undefined field (nested ones included). Optional
//    form fields (message, address, preferredAccessTime...) are legitimately
//    undefined, so they must be dropped rather than fail the whole write. This
//    was the root cause of the generic "Something went wrong" on viewing
//    requests submitted without a message.
//  - Persistent cache is only available where IndexedDB exists (web). React
//    Native has no IndexedDB, so native uses the default in-memory cache.
function createFirestore(): Firestore {
  try {
    return initializeFirestore(firebaseApp, {
      ignoreUndefinedProperties: true,
      ...(Platform.OS === "web"
        ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
        : {}),
    });
  } catch {
    // Already initialised (hot reload). Reuse the existing instance.
    return getFirestore(firebaseApp);
  }
}
export const db: Firestore = createFirestore();

export const storage = getStorage(firebaseApp);

const useEmulator = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === "true";
if (useEmulator) {
  const host = Platform.OS === "android" ? "10.0.2.2" : "localhost";
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
}
