/**
 * COMPLETE FIREBASE AUTH MOCK
 *
 * This mock completely replaces Firebase Auth to satisfy all auth checks.
 * Must be injected BEFORE Firebase SDK loads.
 *
 * Strategy:
 * 1. Mock firebase.auth() to return fake auth instance
 * 2. Mock currentUser with all properties route guards might check
 * 3. Mock onAuthStateChanged to fire IMMEDIATELY with authenticated user
 * 4. Mock getIdToken() to return valid-looking JWT
 * 5. Intercept Firebase SDK initialization to prevent real auth
 */

(function() {
  'use strict';

  console.log('🔥 [Firebase Mock] Initializing BEFORE Firebase SDK...');

  // ============================================
  // MOCK USER DATA
  // ============================================
  const MOCK_UID = 'mock_user_' + Date.now();
  const MOCK_EMAIL = 'demo@gohighlevel.com';
  const MOCK_TOKEN = generateMockJWT();

  /**
   * Generate realistic-looking JWT token
   */
  function generateMockJWT() {
    const header = {
      alg: "HS256",
      typ: "JWT"
    };

    const payload = {
      iss: "https://securetoken.google.com/gohighlevel-mock",
      aud: "gohighlevel-mock",
      auth_time: Math.floor(Date.now() / 1000),
      user_id: MOCK_UID,
      sub: MOCK_UID,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: MOCK_EMAIL,
      email_verified: true,
      firebase: {
        identities: {
          email: [MOCK_EMAIL]
        },
        sign_in_provider: "custom"
      }
    };

    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));
    const signature = btoa('mock_signature_' + Date.now());

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  // ============================================
  // MOCK USER OBJECT
  // ============================================
  const mockUser = {
    // Core properties
    uid: MOCK_UID,
    email: MOCK_EMAIL,
    emailVerified: true,
    displayName: 'Demo User',
    photoURL: 'https://via.placeholder.com/150',
    phoneNumber: '+1234567890',
    isAnonymous: false,

    // Metadata
    metadata: {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString()
    },

    // Provider data
    providerData: [{
      providerId: 'password',
      uid: MOCK_UID,
      displayName: 'Demo User',
      email: MOCK_EMAIL,
      phoneNumber: null,
      photoURL: null
    }],

    providerId: 'firebase',

    // Methods
    getIdToken: function(forceRefresh) {
      console.log('🔥 [Firebase Mock] getIdToken() called, returning mock JWT');
      return Promise.resolve(MOCK_TOKEN);
    },

    getIdTokenResult: function(forceRefresh) {
      console.log('🔥 [Firebase Mock] getIdTokenResult() called');
      return Promise.resolve({
        token: MOCK_TOKEN,
        expirationTime: new Date(Date.now() + 3600000).toISOString(),
        authTime: new Date().toISOString(),
        issuedAtTime: new Date().toISOString(),
        signInProvider: 'custom',
        signInSecondFactor: null,
        claims: {
          user_id: MOCK_UID,
          email: MOCK_EMAIL,
          email_verified: true
        }
      });
    },

    reload: function() {
      console.log('🔥 [Firebase Mock] reload() called');
      return Promise.resolve();
    },

    delete: function() {
      console.log('🔥 [Firebase Mock] delete() called');
      return Promise.resolve();
    },

    toJSON: function() {
      return {
        uid: this.uid,
        email: this.email,
        emailVerified: this.emailVerified,
        displayName: this.displayName,
        photoURL: this.photoURL,
        phoneNumber: this.phoneNumber,
        isAnonymous: this.isAnonymous
      };
    }
  };

  // ============================================
  // MOCK AUTH INSTANCE
  // ============================================
  const authStateCallbacks = [];
  let currentMockUser = mockUser;

  const mockAuth = {
    // Current user - this is what route guards check
    get currentUser() {
      console.log('🔥 [Firebase Mock] currentUser getter called, returning:', currentMockUser ? 'authenticated' : 'null');
      return currentMockUser;
    },

    set currentUser(value) {
      console.log('🔥 [Firebase Mock] currentUser setter called');
      currentMockUser = value;
    },

    // App reference
    app: {
      name: '[DEFAULT]',
      options: {
        apiKey: 'mock-api-key',
        authDomain: 'mock-auth-domain',
        projectId: 'mock-project'
      }
    },

    // Auth state listener - CRITICAL for route guards
    onAuthStateChanged: function(callback, errorCallback, completedCallback) {
      console.log('🔥 [Firebase Mock] onAuthStateChanged() registered');

      // Store callback for later
      authStateCallbacks.push(callback);

      // CRITICAL: Fire callback IMMEDIATELY with authenticated user
      // This ensures route guards see user as authenticated from the start
      setTimeout(() => {
        console.log('🔥 [Firebase Mock] Firing onAuthStateChanged callback with authenticated user');
        try {
          callback(currentMockUser);
          if (completedCallback) completedCallback();
        } catch (e) {
          console.error('🔥 [Firebase Mock] Error in auth state callback:', e);
          if (errorCallback) errorCallback(e);
        }
      }, 0);

      // Return unsubscribe function
      return function unsubscribe() {
        const index = authStateCallbacks.indexOf(callback);
        if (index > -1) {
          authStateCallbacks.splice(index, 1);
        }
      };
    },

    // ID token listener
    onIdTokenChanged: function(callback, errorCallback, completedCallback) {
      console.log('🔥 [Firebase Mock] onIdTokenChanged() registered');

      setTimeout(() => {
        console.log('🔥 [Firebase Mock] Firing onIdTokenChanged callback');
        try {
          callback(currentMockUser);
          if (completedCallback) completedCallback();
        } catch (e) {
          console.error('🔥 [Firebase Mock] Error in token callback:', e);
          if (errorCallback) errorCallback(e);
        }
      }, 0);

      return function unsubscribe() {};
    },

    // Sign in methods
    signInWithCustomToken: function(token) {
      console.log('🔥 [Firebase Mock] signInWithCustomToken() called');
      return Promise.resolve({
        user: currentMockUser,
        credential: null,
        operationType: 'signIn',
        additionalUserInfo: null
      });
    },

    signInWithEmailAndPassword: function(email, password) {
      console.log('🔥 [Firebase Mock] signInWithEmailAndPassword() called');
      return Promise.resolve({
        user: currentMockUser,
        credential: null,
        operationType: 'signIn',
        additionalUserInfo: null
      });
    },

    signInWithCredential: function(credential) {
      console.log('🔥 [Firebase Mock] signInWithCredential() called');
      return Promise.resolve({
        user: currentMockUser,
        credential: credential,
        operationType: 'signIn',
        additionalUserInfo: null
      });
    },

    signInAnonymously: function() {
      console.log('🔥 [Firebase Mock] signInAnonymously() called');
      return Promise.resolve({
        user: currentMockUser,
        credential: null,
        operationType: 'signIn',
        additionalUserInfo: null
      });
    },

    // Sign out
    signOut: function() {
      console.log('🔥 [Firebase Mock] signOut() called (blocked)');
      return Promise.resolve();
    },

    // Settings
    settings: {
      appVerificationDisabledForTesting: true
    },

    // Language code
    languageCode: 'en',

    // Tenant ID
    tenantId: null,

    // Methods that might be called
    setPersistence: function(persistence) {
      console.log('🔥 [Firebase Mock] setPersistence() called');
      return Promise.resolve();
    },

    updateCurrentUser: function(user) {
      console.log('🔥 [Firebase Mock] updateCurrentUser() called');
      currentMockUser = user;
      return Promise.resolve();
    },

    useDeviceLanguage: function() {
      console.log('🔥 [Firebase Mock] useDeviceLanguage() called');
    },

    // Apply action code methods
    applyActionCode: function(code) {
      return Promise.resolve();
    },

    checkActionCode: function(code) {
      return Promise.resolve({
        operation: 'EMAIL_SIGNIN',
        data: { email: MOCK_EMAIL }
      });
    },

    confirmPasswordReset: function(code, newPassword) {
      return Promise.resolve();
    },

    verifyPasswordResetCode: function(code) {
      return Promise.resolve(MOCK_EMAIL);
    }
  };

  // ============================================
  // MOCK FIREBASE APP
  // ============================================
  const mockFirebaseApp = {
    name: '[DEFAULT]',
    options: {
      apiKey: 'mock-api-key',
      authDomain: 'mock-auth-domain.firebaseapp.com',
      databaseURL: 'https://mock-project.firebaseio.com',
      projectId: 'mock-project',
      storageBucket: 'mock-project.appspot.com',
      messagingSenderId: '123456789',
      appId: '1:123456789:web:abc123'
    },
    automaticDataCollectionEnabled: false
  };

  // ============================================
  // MOCK FIREBASE NAMESPACE
  // ============================================
  window.firebase = {
    // Auth function - returns our mock auth instance
    auth: function(app) {
      console.log('🔥 [Firebase Mock] firebase.auth() called');
      return mockAuth;
    },

    // Initialize app (already "initialized")
    initializeApp: function(config, name) {
      console.log('🔥 [Firebase Mock] initializeApp() called (returning existing mock app)');
      return mockFirebaseApp;
    },

    // Apps array
    apps: [mockFirebaseApp],

    // SDK version
    SDK_VERSION: '10.0.0-mock',

    // Other services (stub them out)
    database: function() {
      return {
        ref: function() { return {}; },
        goOnline: function() {},
        goOffline: function() {}
      };
    },

    firestore: function() {
      return {
        collection: function() { return {}; },
        doc: function() { return {}; }
      };
    },

    storage: function() {
      return {
        ref: function() { return {}; }
      };
    }
  };

  // ============================================
  // ALSO MOCK @firebase/auth MODULE
  // ============================================
  // Some apps use ES6 imports like: import { getAuth } from '@firebase/auth'

  // Create a getAuth function
  window.getAuth = function(app) {
    console.log('🔥 [Firebase Mock] getAuth() called (ES6 module style)');
    return mockAuth;
  };

  // ============================================
  // PREVENT REAL FIREBASE FROM OVERWRITING
  // ============================================
  // Make firebase object non-configurable to prevent SDK from replacing it
  Object.defineProperty(window, 'firebase', {
    value: window.firebase,
    writable: false,
    configurable: false
  });

  // ============================================
  // INJECT MOCK TOKEN INTO STORAGE
  // ============================================
  try {
    // Store token in localStorage for API calls
    localStorage.setItem('firebaseToken', MOCK_TOKEN);
    localStorage.setItem('firebase:authUser:[DEFAULT]', JSON.stringify({
      uid: MOCK_UID,
      email: MOCK_EMAIL,
      emailVerified: true,
      displayName: 'Demo User',
      stsTokenManager: {
        refreshToken: 'mock-refresh-token',
        accessToken: MOCK_TOKEN,
        expirationTime: Date.now() + 3600000
      }
    }));
    console.log('🔥 [Firebase Mock] Injected auth tokens into localStorage');
  } catch (e) {
    console.warn('🔥 [Firebase Mock] Could not write to localStorage:', e);
  }

  // ============================================
  // DIAGNOSTIC: Log when route guards check auth
  // ============================================
  const originalDefineProperty = Object.defineProperty;
  Object.defineProperty = function(obj, prop, descriptor) {
    if (prop === 'currentUser' && obj === mockAuth) {
      console.log('🔥 [Firebase Mock] WARNING: Something tried to redefine currentUser!');
    }
    return originalDefineProperty.call(this, obj, prop, descriptor);
  };

  console.log('🔥 [Firebase Mock] ============================================');
  console.log('🔥 [Firebase Mock] Firebase Auth COMPLETELY MOCKED');
  console.log('🔥 [Firebase Mock] Current user:', mockUser.email);
  console.log('🔥 [Firebase Mock] Token:', MOCK_TOKEN.substring(0, 50) + '...');
  console.log('🔥 [Firebase Mock] Auth state callbacks will fire immediately');
  console.log('🔥 [Firebase Mock] Route guards should pass');
  console.log('🔥 [Firebase Mock] ============================================');

  // Export for debugging
  window.__FIREBASE_MOCK__ = {
    auth: mockAuth,
    user: mockUser,
    token: MOCK_TOKEN,
    triggerAuthCallbacks: function() {
      console.log('🔥 [Firebase Mock] Manually triggering auth callbacks');
      authStateCallbacks.forEach(cb => {
        try {
          cb(currentMockUser);
        } catch (e) {
          console.error('🔥 [Firebase Mock] Callback error:', e);
        }
      });
    }
  };
})();
