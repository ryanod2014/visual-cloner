/**
 * AUTH BYPASS V2 - Multi-Layer Auth Interception
 *
 * Philosophy: Don't fight the router - make it THINK auth succeeded
 *
 * This approach is more elegant than direct component mounting because:
 * 1. Preserves app functionality (navigation works)
 * 2. Works WITH Vue's architecture, not against it
 * 3. Addresses root cause (failed auth checks, not router itself)
 * 4. More generalizable across different apps
 */

class AuthBypass {
  constructor(vueApp) {
    this.vueApp = vueApp;
    this.store = vueApp?.config?.globalProperties?.$store;
    this.router = vueApp?.config?.globalProperties?.$router;
    this.intercepted = new Set();
    this.debug = true;
  }

  /**
   * LAYER 1: Vuex State Deep Interception
   * Intercept ALL property accesses on auth object
   */
  interceptVuexState() {
    if (!this.store?.state) {
      this.log('⚠️ No Vuex store found');
      return;
    }

    this.log('🔧 Layer 1: Intercepting Vuex state.auth...');

    // Create comprehensive auth object that responds to ANY property access
    const authProxy = new Proxy({
      // Preset common properties
      authenticated: true,
      isAuthenticated: true,
      loggedIn: true,
      isLoggedIn: true,
      token: 'mock_jwt_token_' + Date.now(),
      accessToken: 'mock_access_token_' + Date.now(),
      refreshToken: 'mock_refresh_token_' + Date.now(),
      user: {
        id: 'mock_user_123',
        uid: 'mock_user_123',
        email: 'demo@example.com',
        name: 'Demo User',
        firstName: 'Demo',
        lastName: 'User',
        role: 'admin',
        type: 'account',
        status: 'active',
        emailVerified: true
      },
      company: {
        id: 'mock_company_123',
        name: 'Demo Company',
        status: 'active'
      },
      location: {
        id: 'mock_location_123',
        name: 'Demo Location'
      }
    }, {
      get: (target, prop) => {
        this.log(`🔍 Auth check: state.auth.${String(prop)}`);

        // If property exists in target, return it
        if (prop in target) {
          return target[prop];
        }

        // Auto-generate appropriate response based on property name
        const propStr = String(prop);
        const propLower = propStr.toLowerCase();

        // Boolean checks (authenticated, logged in, verified, etc.)
        if (propLower.includes('auth') ||
            propLower.includes('logged') ||
            propLower.includes('verified') ||
            propLower.includes('valid') ||
            propLower.includes('active')) {
          return true;
        }

        // Token-related
        if (propLower.includes('token')) {
          return 'mock_' + propStr + '_' + Date.now();
        }

        // User-related
        if (propLower.includes('user')) {
          return target.user;
        }

        // Company/Organization
        if (propLower.includes('company') || propLower.includes('organization')) {
          return target.company;
        }

        // Location
        if (propLower.includes('location')) {
          return target.location;
        }

        // Permissions/Roles
        if (propLower.includes('permission') || propLower.includes('role')) {
          return ['admin', 'user', 'read', 'write', 'delete'];
        }

        // IDs
        if (propLower.includes('id')) {
          return 'mock_' + propStr + '_123';
        }

        // Default: return true for any unknown boolean-like checks
        return true;
      },
      set: (target, prop, value) => {
        // Allow sets but log them
        this.log(`✍️ Auth mutation: state.auth.${String(prop)} = ${value}`);
        target[prop] = value;
        return true;
      }
    });

    // Replace the entire auth object with our proxy
    try {
      Object.defineProperty(this.store.state, 'auth', {
        get: () => authProxy,
        set: (value) => {
          this.log('⚠️ Attempted to replace auth object, ignoring');
          // Don't allow replacement of our proxy
        },
        configurable: true
      });

      this.log('✅ Vuex state.auth intercepted with comprehensive proxy');
      this.intercepted.add('vuex-state');
    } catch (e) {
      this.log('❌ Failed to intercept Vuex state:', e.message);
    }
  }

  /**
   * LAYER 2: Vuex Getters Interception
   * Many apps use computed getters instead of direct state access
   */
  interceptVuexGetters() {
    if (!this.store?.getters) {
      this.log('⚠️ No Vuex getters found');
      return;
    }

    this.log('🔧 Layer 2: Intercepting Vuex getters...');

    let interceptCount = 0;

    // Get all getter names
    const getterNames = Object.keys(this.store.getters);
    this.log(`📊 Found ${getterNames.length} getters`);

    getterNames.forEach(key => {
      if (this.isAuthRelatedGetter(key)) {
        try {
          Object.defineProperty(this.store.getters, key, {
            get: () => {
              this.log(`🔍 Getter check: ${key}`);
              return this.getAuthValue(key);
            },
            configurable: true,
            enumerable: true
          });
          interceptCount++;
        } catch (e) {
          // Some getters might not be configurable
          this.log(`⚠️ Could not intercept getter: ${key}`);
        }
      }
    });

    this.log(`✅ Intercepted ${interceptCount} auth-related getters`);
    if (interceptCount > 0) {
      this.intercepted.add('vuex-getters');
    }
  }

  /**
   * LAYER 3: Firebase Auth Mocking
   * Many apps (including GHL) use Firebase for auth
   */
  interceptFirebase() {
    if (!window.firebase) {
      this.log('ℹ️ Firebase not detected, skipping');
      return;
    }

    this.log('🔧 Layer 3: Mocking Firebase auth...');

    const mockUser = {
      uid: 'mock_user_123',
      email: 'demo@example.com',
      displayName: 'Demo User',
      emailVerified: true,
      phoneNumber: null,
      photoURL: null,
      isAnonymous: false,
      metadata: {
        creationTime: new Date().toISOString(),
        lastSignInTime: new Date().toISOString()
      },
      providerData: [{
        providerId: 'password',
        uid: 'mock_user_123',
        displayName: 'Demo User',
        email: 'demo@example.com'
      }],
      refreshToken: 'mock_refresh_token_' + Date.now(),
      tenantId: null,

      // Methods
      getIdToken: (forceRefresh = false) => {
        this.log('🔥 Firebase: getIdToken() called');
        return Promise.resolve('mock_firebase_token_' + Date.now());
      },
      getIdTokenResult: (forceRefresh = false) => {
        this.log('🔥 Firebase: getIdTokenResult() called');
        return Promise.resolve({
          token: 'mock_firebase_token_' + Date.now(),
          expirationTime: new Date(Date.now() + 3600000).toISOString(),
          authTime: new Date().toISOString(),
          issuedAtTime: new Date().toISOString(),
          signInProvider: 'password',
          claims: {
            admin: true,
            user_id: 'mock_user_123',
            email: 'demo@example.com',
            email_verified: true
          }
        });
      },
      reload: () => {
        this.log('🔥 Firebase: reload() called');
        return Promise.resolve();
      },
      delete: () => Promise.resolve(),
      toJSON: () => mockUser
    };

    // Mock Firebase auth singleton
    const mockAuth = {
      currentUser: mockUser,

      onAuthStateChanged: (callback, errorCallback) => {
        this.log('🔥 Firebase: onAuthStateChanged() registered');
        // Call immediately with mock user
        setTimeout(() => callback(mockUser), 0);
        // Return unsubscribe function
        return () => {};
      },

      onIdTokenChanged: (callback, errorCallback) => {
        this.log('🔥 Firebase: onIdTokenChanged() registered');
        setTimeout(() => callback(mockUser), 0);
        return () => {};
      },

      signInWithCustomToken: (token) => {
        this.log('🔥 Firebase: signInWithCustomToken() called');
        return Promise.resolve({ user: mockUser });
      },

      signInWithEmailAndPassword: (email, password) => {
        this.log('🔥 Firebase: signInWithEmailAndPassword() called');
        return Promise.resolve({ user: mockUser });
      },

      signOut: () => {
        this.log('🔥 Firebase: signOut() called');
        return Promise.resolve();
      },

      // Add any other methods GHL might use
      setPersistence: () => Promise.resolve(),
      languageCode: 'en',
      settings: {},
      app: window.firebase.app || {}
    };

    // Replace Firebase auth
    try {
      window.firebase.auth = () => mockAuth;
      this.log('✅ Firebase auth fully mocked');
      this.intercepted.add('firebase');
    } catch (e) {
      this.log('❌ Failed to mock Firebase:', e.message);
    }
  }

  /**
   * LAYER 4: Router Guard Clearing
   * Last resort - just disable all guards
   */
  interceptRouterGuards() {
    if (!this.router) {
      this.log('⚠️ No Vue Router found');
      return;
    }

    this.log('🔧 Layer 4: Clearing router guards...');

    // Clear global guards
    if (this.router.beforeHooks) {
      const count = this.router.beforeHooks.length;
      this.router.beforeHooks = [];
      this.log(`✅ Cleared ${count} beforeEach guards`);
    }

    if (this.router.beforeResolveHooks) {
      const count = this.router.beforeResolveHooks.length;
      this.router.beforeResolveHooks = [];
      this.log(`✅ Cleared ${count} beforeResolve guards`);
    }

    if (this.router.afterHooks) {
      // Keep afterHooks - they don't block navigation
    }

    // Monkey-patch router.push to ensure guards stay cleared
    const originalPush = this.router.push.bind(this.router);
    const self = this;

    this.router.push = async function(to) {
      self.log(`🚀 Router.push() intercepted: ${typeof to === 'string' ? to : to.path}`);

      // Ensure guards are still cleared
      this.beforeHooks = [];
      this.beforeResolveHooks = [];

      try {
        const result = await originalPush(to);
        self.log(`✅ Navigation succeeded`);
        return result;
      } catch (error) {
        // Navigation failures are sometimes expected (duplicate navigation, etc.)
        if (!error.message?.includes('Avoided redundant navigation')) {
          self.log(`⚠️ Navigation failed: ${error.message}`);
        }
        throw error;
      }
    };

    // Also patch replace for good measure
    const originalReplace = this.router.replace.bind(this.router);
    this.router.replace = async function(to) {
      self.log(`🚀 Router.replace() intercepted: ${typeof to === 'string' ? to : to.path}`);
      this.beforeHooks = [];
      this.beforeResolveHooks = [];
      return originalReplace(to);
    };

    this.log('✅ Router guards cleared and push/replace patched');
    this.intercepted.add('router-guards');
  }

  /**
   * LAYER 5: Window-level Auth Functions
   * Some apps have global auth check functions
   */
  interceptGlobalAuthFunctions() {
    this.log('🔧 Layer 5: Injecting global auth functions...');

    const authFunctions = {
      isAuthenticated: () => { this.log('🔍 Global: isAuthenticated()'); return true; },
      isLoggedIn: () => { this.log('🔍 Global: isLoggedIn()'); return true; },
      checkAuth: () => { this.log('🔍 Global: checkAuth()'); return true; },
      hasAuth: () => { this.log('🔍 Global: hasAuth()'); return true; },
      isAuth: () => { this.log('🔍 Global: isAuth()'); return true; },
      getAuthToken: () => { this.log('🔍 Global: getAuthToken()'); return 'mock_token'; },
      getCurrentUser: () => { this.log('🔍 Global: getCurrentUser()'); return { id: 'mock_user_123' }; }
    };

    let injectedCount = 0;
    Object.entries(authFunctions).forEach(([name, fn]) => {
      if (typeof window[name] === 'undefined') {
        window[name] = fn;
        injectedCount++;
      }
    });

    this.log(`✅ Injected ${injectedCount} global auth functions`);
    if (injectedCount > 0) {
      this.intercepted.add('global-functions');
    }
  }

  /**
   * Execute all layers
   */
  async bypass() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔐 AUTH BYPASS V2 - Multi-Layer Interception');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Execute all layers
    this.interceptVuexState();
    this.interceptVuexGetters();
    this.interceptFirebase();
    this.interceptRouterGuards();
    this.interceptGlobalAuthFunctions();

    console.log('');
    console.log('📊 Summary:');
    console.log('   Layers active:', Array.from(this.intercepted).join(', '));
    console.log('');

    // Wait for everything to settle
    await this.wait(500);

    // Attempt navigation
    if (this.router) {
      const routesToTry = [
        '/dashboard',
        '/v2/location',
        '/home',
        '/app',
        '/main'
      ];

      console.log('🚀 Attempting navigation...');

      for (const route of routesToTry) {
        try {
          console.log(`   Trying: ${route}`);
          await this.router.push(route);
          console.log(`   ✅ Navigated to: ${route}`);
          break;
        } catch (e) {
          if (!e.message?.includes('Avoided redundant navigation')) {
            console.log(`   ❌ Failed: ${e.message}`);
          }
        }
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Auth bypass complete');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Return diagnostic info
    return {
      success: this.intercepted.size > 0,
      layers: Array.from(this.intercepted),
      currentRoute: this.router?.currentRoute?.value?.path,
      store: !!this.store,
      router: !!this.router
    };
  }

  /**
   * Helper: Check if getter name is auth-related
   */
  isAuthRelatedGetter(name) {
    const keywords = [
      'auth', 'Auth',
      'logged', 'Logged',
      'token', 'Token',
      'user', 'User',
      'session', 'Session',
      'credential', 'Credential'
    ];
    return keywords.some(kw => name.includes(kw));
  }

  /**
   * Helper: Get appropriate value for auth property
   */
  getAuthValue(prop) {
    const propLower = prop.toLowerCase();

    // Boolean checks
    if (propLower.includes('authenticated') ||
        propLower.includes('logged') ||
        propLower.includes('active') ||
        propLower.includes('valid')) {
      return true;
    }

    // Token
    if (propLower.includes('token')) {
      return 'mock_' + prop + '_' + Date.now();
    }

    // User object
    if (propLower.includes('user')) {
      return {
        id: 'mock_user_123',
        email: 'demo@example.com',
        name: 'Demo User',
        role: 'admin'
      };
    }

    // Default: true (safe for most checks)
    return true;
  }

  /**
   * Helper: Async wait
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Helper: Logging
   */
  log(message, ...args) {
    if (this.debug) {
      console.log(`[AuthBypass] ${message}`, ...args);
    }
  }
}

/**
 * Auto-execute when loaded
 */
(function() {
  console.log('🔐 Auth Bypass V2 script loaded');

  // Wait for Vue to mount
  const initBypass = () => {
    const vueApp = window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0];

    if (!vueApp) {
      console.log('⏳ Waiting for Vue app...');
      setTimeout(initBypass, 100);
      return;
    }

    console.log('✅ Vue app detected, initializing bypass...');

    const bypass = new AuthBypass(vueApp);
    window.__AUTH_BYPASS__ = bypass; // Expose for debugging

    bypass.bypass().then(result => {
      console.log('📊 Bypass result:', result);
    }).catch(err => {
      console.error('❌ Bypass failed:', err);
    });
  };

  // Start after DOM loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBypass);
  } else {
    initBypass();
  }
})();
