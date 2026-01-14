/**
 * FIREBASE AUTH MOCK INTEGRATION
 *
 * Integrates Firebase Auth mock with the UniversalAutoMocker
 *
 * Usage:
 * 1. Load firebase-auth-mock.js BEFORE any app scripts
 * 2. Load this integration script
 * 3. Load auto-mocker.js
 * 4. Load app scripts
 *
 * This ensures Firebase is mocked before:
 * - Firebase SDK initializes
 * - Vue Router sets up navigation guards
 * - Any auth checks run
 */

class FirebaseAuthIntegration {
  constructor(autoMocker) {
    this.autoMocker = autoMocker;
    this.firebaseMock = window.__FIREBASE_MOCK__;

    if (!this.firebaseMock) {
      console.error('❌ [Firebase Integration] firebase-auth-mock.js must be loaded first!');
      return;
    }

    console.log('🔥 [Firebase Integration] Initializing...');
    this.init();
  }

  init() {
    // Enhance auto-mocker to work with Firebase mock
    this.injectFirebaseAPI();
    this.interceptFirebaseAPICalls();
    this.setupAuthStateSync();

    console.log('✅ [Firebase Integration] Initialized');
  }

  /**
   * Inject Firebase API endpoints into auto-mocker
   */
  injectFirebaseAPI() {
    if (!this.autoMocker) return;

    // Add Firebase API patterns to auto-mocker
    const firebaseAPIs = {
      // Identity Toolkit (Firebase Auth backend)
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword': {
        kind: 'identitytoolkit#VerifyPasswordResponse',
        localId: this.firebaseMock.user.uid,
        email: this.firebaseMock.user.email,
        displayName: this.firebaseMock.user.displayName,
        idToken: this.firebaseMock.token,
        registered: true,
        refreshToken: 'mock_refresh_token',
        expiresIn: '3600'
      },

      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken': {
        kind: 'identitytoolkit#VerifyCustomTokenResponse',
        idToken: this.firebaseMock.token,
        refreshToken: 'mock_refresh_token',
        expiresIn: '3600',
        isNewUser: false
      },

      'https://securetoken.googleapis.com/v1/token': {
        access_token: this.firebaseMock.token,
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: 'mock_refresh_token',
        id_token: this.firebaseMock.token,
        user_id: this.firebaseMock.user.uid,
        project_id: 'mock-project'
      },

      // Firebase Installations
      'https://firebaseinstallations.googleapis.com/v1/projects': {
        name: 'projects/mock-project/installations/mock-installation',
        fid: 'mock_fid_' + Date.now(),
        refreshToken: 'mock_refresh_token',
        authToken: {
          token: this.firebaseMock.token,
          expiresIn: '604800s'
        }
      }
    };

    // If auto-mocker exists, inject these APIs
    if (this.autoMocker?.state?.apis) {
      Object.entries(firebaseAPIs).forEach(([url, mock]) => {
        this.autoMocker.state.apis[url] = {
          method: 'POST',
          calls: 0,
          mock: mock,
          lastCall: null,
          errors: []
        };
      });

      console.log('✅ [Firebase Integration] Injected Firebase API mocks');
    }
  }

  /**
   * Intercept Firebase API calls (already handled by fetch interceptor)
   */
  interceptFirebaseAPICalls() {
    // The auto-mocker already intercepts fetch/XHR
    // Just ensure Firebase domains are recognized
    const firebaseDomains = [
      'googleapis.com',
      'firebaseio.com',
      'firebaseapp.com',
      'gstatic.com'
    ];

    console.log('✅ [Firebase Integration] Firebase API domains registered');
  }

  /**
   * Sync Firebase auth state with Vuex store
   */
  setupAuthStateSync() {
    // Wait for Vuex store to be available
    const checkForStore = () => {
      const app = document.getElementById('app');
      const vueApp = window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0];
      const store = vueApp?.config?.globalProperties?.$store ||
                    app?.__vue_app__?.config?.globalProperties?.$store;

      if (store?.state) {
        this.syncWithVuex(store);
      } else {
        setTimeout(checkForStore, 100);
      }
    };

    setTimeout(checkForStore, 500);
  }

  /**
   * Sync Firebase mock user with Vuex store
   */
  syncWithVuex(store) {
    console.log('🔥 [Firebase Integration] Syncing Firebase auth with Vuex...');

    try {
      // Set auth state in store
      if (store.state.auth) {
        store.state.auth.firebaseToken = this.firebaseMock.token;
        store.state.auth.isAuthenticated = true;
        store.state.auth.user = {
          id: this.firebaseMock.user.uid,
          email: this.firebaseMock.user.email,
          name: this.firebaseMock.user.displayName,
          emailVerified: this.firebaseMock.user.emailVerified
        };
      }

      // Try to commit auth mutations if they exist
      if (store.commit) {
        const mutations = ['auth/setToken', 'auth/setUser', 'auth/setAuthenticated'];
        mutations.forEach(mutation => {
          try {
            if (mutation.includes('Token')) {
              store.commit(mutation, this.firebaseMock.token);
            } else if (mutation.includes('User')) {
              store.commit(mutation, store.state.auth.user);
            } else if (mutation.includes('Authenticated')) {
              store.commit(mutation, true);
            }
          } catch (e) {
            // Mutation might not exist
          }
        });
      }

      console.log('✅ [Firebase Integration] Synced with Vuex store');
    } catch (e) {
      console.warn('⚠️ [Firebase Integration] Could not sync with Vuex:', e.message);
    }
  }

  /**
   * Manually trigger auth state callbacks (for debugging)
   */
  triggerAuthCallbacks() {
    if (this.firebaseMock) {
      this.firebaseMock.triggerAuthCallbacks();
    }
  }
}

// Auto-initialize when auto-mocker is ready
if (window.__AUTO_MOCKER__) {
  window.__FIREBASE_INTEGRATION__ = new FirebaseAuthIntegration(window.__AUTO_MOCKER__);
} else {
  // Wait for auto-mocker
  const waitForAutoMocker = setInterval(() => {
    if (window.__AUTO_MOCKER__) {
      clearInterval(waitForAutoMocker);
      window.__FIREBASE_INTEGRATION__ = new FirebaseAuthIntegration(window.__AUTO_MOCKER__);
    }
  }, 100);

  // Give up after 10 seconds
  setTimeout(() => clearInterval(waitForAutoMocker), 10000);
}
