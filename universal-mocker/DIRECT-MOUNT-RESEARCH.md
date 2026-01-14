# Direct Vue Component Mounting - Deep Research & Philosophy

**Date**: January 10, 2026
**Context**: GHL router guards blocking navigation despite proper Vuex state
**Question**: Can we bypass router entirely and directly mount dashboard component?

---

## Table of Contents
1. [Problem from First Principles](#problem-from-first-principles)
2. [Approach 1: Direct Component Mounting](#approach-1-direct-component-mounting)
3. [Approach 2: Router Instance Replacement](#approach-2-router-instance-replacement)
4. [Approach 3: Route Guard Surgical Patching](#approach-3-route-guard-surgical-patching)
5. [Approach 4: Auth State Interception](#approach-4-auth-state-interception)
6. [Philosophical Analysis](#philosophical-analysis)
7. [Final Recommendation](#final-recommendation)

---

## Problem from First Principles

### What's Actually Happening

```
User loads GHL → Auto-mocker injects Vuex state → router.push('/dashboard') called
                                                                    ↓
                                                    Route guard checks auth
                                                                    ↓
                                                    if (!store.state.auth.authenticated)
                                                                    ↓
                                                    next('/') ← Redirects back to login
                                                                    ↓
                                                    Dashboard never mounts
```

### The Core Question

**Is the router the problem, or is the auth check the problem?**

This is critical. The router is doing exactly what it's designed to do: protect routes. The real issue is that **we haven't satisfied the auth conditions the route guard checks**.

### Two Philosophies

**Philosophy A: "Bypass the bouncer"**
- Don't try to get past the bouncer (router guard)
- Sneak in the side door (mount component directly)
- Pros: Definitely gets us in
- Cons: We're not "really" at the dashboard route, breaks navigation

**Philosophy B: "Convince the bouncer"**
- Give the bouncer what they want (proper auth state)
- Walk through the front door (normal routing)
- Pros: App works normally, navigation intact
- Cons: Requires knowing what auth checks exist

---

## Approach 1: Direct Component Mounting

### The Idea
Bypass router entirely. Find dashboard component in Vue's registry and mount it manually.

### Research Findings

**Vue 3 Component Mounting APIs:**
- `createApp(component)` - Creates new app instance
- `h(component, props)` - Creates VNode
- `render(vnode, container)` - Renders VNode to DOM
- `app._context.components` - Internal component registry

**Sources:**
- [Creating a Vue Application | Vue.js](https://vuejs.org/guide/essentials/application.html)
- [Programmatically create and mount component · Issue #1802](https://github.com/vuejs/core/issues/1802)
- [Render Functions & JSX | Vue.js](https://vuejs.org/guide/extras/render-function.html)
- [Improve rendering vue components programmatically · Discussion #582](https://github.com/vuejs/rfcs/discussions/582)

### Implementation

```javascript
/**
 * APPROACH 1: Direct Component Mounting
 * Bypasses router entirely and mounts dashboard component manually
 */

// Step 1: Find dashboard component in Vue's component registry
const findDashboardComponent = (vueApp) => {
  console.log('🔍 Searching for dashboard component...');

  // Try accessing component registry (internal API - not guaranteed)
  const components = vueApp?._context?.components;

  if (!components) {
    console.error('❌ Cannot access component registry');
    return null;
  }

  // Search strategies (in order of likelihood)
  const searchStrategies = [
    // 1. Direct name match
    () => components.Dashboard || components.DashboardView || components.DashboardPage,

    // 2. Case-insensitive search
    () => Object.keys(components).find(name =>
      name.toLowerCase().includes('dashboard')
    ),

    // 3. Search in router routes
    () => {
      const router = vueApp.config.globalProperties.$router;
      const dashRoute = router?.options?.routes?.find(r =>
        r.path === '/dashboard' || r.name === 'dashboard'
      );
      return dashRoute?.component;
    },

    // 4. Check resolved routes
    () => {
      const router = vueApp.config.globalProperties.$router;
      try {
        const resolved = router.resolve('/dashboard');
        return resolved.matched[0]?.components?.default;
      } catch (e) {
        return null;
      }
    }
  ];

  for (const strategy of searchStrategies) {
    const component = strategy();
    if (component) {
      console.log('✅ Found dashboard component:', component.name || 'Anonymous');
      return component;
    }
  }

  console.error('❌ Dashboard component not found');
  return null;
};

// Step 2: Mount component using Vue 3 render API
const mountDashboardDirectly = (vueApp, DashboardComponent) => {
  console.log('🚀 Mounting dashboard component directly...');

  import { h, render } from 'vue';

  // Create a VNode for the dashboard
  const vnode = h(DashboardComponent, {
    // Pass any required props
    // Note: Dashboard might expect route props - this is a risk
  });

  // CRITICAL: Attach app context so component has access to:
  // - $store (Vuex)
  // - $router (Vue Router)
  // - Global plugins
  vnode.appContext = vueApp._context;

  // Get or create container
  const container = document.getElementById('app') || document.body;

  // Clear existing content
  container.innerHTML = '';

  // Render dashboard
  render(vnode, container);

  console.log('✅ Dashboard component mounted directly');

  return {
    unmount: () => render(null, container),
    vnode
  };
};

// Step 3: Alternative - Create new app instance
const mountDashboardAsNewApp = (DashboardComponent, store, router) => {
  console.log('🚀 Mounting dashboard as new app instance...');

  import { createApp } from 'vue';

  // Create new app with dashboard as root
  const dashboardApp = createApp(DashboardComponent);

  // Re-attach existing plugins
  if (store) dashboardApp.use(store);
  if (router) dashboardApp.use(router);

  // Mount to app container
  const container = document.getElementById('app');
  container.innerHTML = ''; // Clear existing
  dashboardApp.mount(container);

  console.log('✅ Dashboard mounted as new app');

  return {
    unmount: () => dashboardApp.unmount(),
    app: dashboardApp
  };
};

// Usage
const directMountSolution = () => {
  const vueApp = window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0];

  if (!vueApp) {
    console.error('❌ Vue app not found');
    return;
  }

  const DashboardComponent = findDashboardComponent(vueApp);

  if (!DashboardComponent) {
    console.error('❌ Cannot mount - dashboard component not found');
    return;
  }

  // Try Method 1: Direct render (preserves app context)
  try {
    return mountDashboardDirectly(vueApp, DashboardComponent);
  } catch (e) {
    console.error('❌ Direct mount failed:', e);
  }

  // Try Method 2: New app instance (might lose some context)
  try {
    const store = vueApp.config.globalProperties.$store;
    const router = vueApp.config.globalProperties.$router;
    return mountDashboardAsNewApp(DashboardComponent, store, router);
  } catch (e) {
    console.error('❌ New app mount failed:', e);
  }
};
```

### Will This Work?

**✅ Pros:**
- Definitely bypasses route guards
- Component will mount (if found)
- We control the mounting process

**❌ Cons:**
- Dashboard component name might be minified (e.g., `Yq` instead of `Dashboard`)
- Component expects route context (`$route.params`, `$route.query`)
- Navigation breaks (no URL changes, back/forward broken)
- Component lifecycle might fail without route context
- Lazy-loaded components might not be in registry yet

**Likelihood of Success: 6/10**
- Will likely mount something
- But functionality probably broken

---

## Approach 2: Router Instance Replacement

### The Idea
Don't bypass router - replace it with a new router that has no guards.

### Research Findings

**Vue Router 4 Architecture:**
- Router instance stored in `app.config.globalProperties.$router`
- Can create new router with `createRouter()`
- Can swap router instances (not officially supported but possible)

**Sources:**
- [Router | Vue Router](https://router.vuejs.org/api/interfaces/router)
- [Navigation Guards | Vue Router](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [Design for Vue 3 · Issue #3124](https://github.com/vuejs/vue-router/issues/3124)

### Implementation

```javascript
/**
 * APPROACH 2: Router Replacement
 * Creates new router with identical routes but no guards
 */

const cloneRouterWithoutGuards = (originalRouter) => {
  console.log('🔄 Cloning router without guards...');

  import { createRouter, createWebHistory } from 'vue-router';

  // Extract routes from original router
  const routes = originalRouter.options.routes;

  // Deep clone routes and strip all guards
  const cleanRoutes = JSON.parse(JSON.stringify(routes)).map(route => {
    // Remove all guard functions
    delete route.beforeEnter;
    delete route.beforeRouteEnter;
    delete route.beforeRouteUpdate;
    delete route.beforeRouteLeave;

    // Recursively clean children
    if (route.children) {
      route.children = route.children.map(child => {
        delete child.beforeEnter;
        delete child.beforeRouteEnter;
        delete child.beforeRouteUpdate;
        delete child.beforeRouteLeave;
        return child;
      });
    }

    return route;
  });

  // Create new router with clean routes
  const newRouter = createRouter({
    history: createWebHistory(),
    routes: cleanRoutes
  });

  console.log('✅ Clean router created');
  return newRouter;
};

const replaceRouter = (vueApp, newRouter) => {
  console.log('🔄 Replacing router instance...');

  const store = vueApp.config.globalProperties.$store;

  // Replace router in app config
  vueApp.config.globalProperties.$router = newRouter;

  // Replace router in store (if Vuex is using it)
  if (store && store._vm) {
    store._vm.$router = newRouter;
  }

  // Force re-render
  if (vueApp._instance?.proxy?.$forceUpdate) {
    vueApp._instance.proxy.$forceUpdate();
  }

  console.log('✅ Router replaced');
};

// Usage
const routerReplacementSolution = () => {
  const vueApp = window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0];
  const originalRouter = vueApp?.config?.globalProperties?.$router;

  if (!originalRouter) {
    console.error('❌ Router not found');
    return;
  }

  const cleanRouter = cloneRouterWithoutGuards(originalRouter);
  replaceRouter(vueApp, cleanRouter);

  // Now navigate
  setTimeout(() => {
    cleanRouter.push('/dashboard');
    console.log('✅ Navigation attempted with clean router');
  }, 100);
};
```

### Will This Work?

**❌ Critical Problem:**
- Routes might not have component references (lazy loaded)
- When we `JSON.parse(JSON.stringify(routes))`, we lose function references
- Component definitions are functions, not serializable

**Better Implementation:**

```javascript
const cloneRouterPreservingComponents = (originalRouter) => {
  const routes = originalRouter.options.routes;

  // Shallow clone to preserve component references
  const cleanRoutes = routes.map(route => ({
    ...route,
    beforeEnter: undefined, // Remove guard
    children: route.children?.map(child => ({
      ...child,
      beforeEnter: undefined
    }))
  }));

  return createRouter({
    history: createWebHistory(),
    routes: cleanRoutes
  });
};
```

**Likelihood of Success: 4/10**
- Very hacky
- Might break app in unexpected ways
- Component references might be lost

---

## Approach 3: Route Guard Surgical Patching

### The Idea
Don't bypass or replace - surgically disable guards on the exact route we need.

### Research Findings

**Route Guard Architecture:**
- Per-route guards: `route.beforeEnter`
- Component guards: Component.beforeRouteEnter
- Route records in `route.matched[]` array

**Sources:**
- [Navigation Guards | Vue Router](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [Route Meta Fields | Vue Router](https://router.vuejs.org/guide/advanced/meta.html)
- [Navigation Guards - Vue Router 4](https://docs.w3cub.com/vue_router~4/guide/advanced/navigation-guards.html)

### Implementation

```javascript
/**
 * APPROACH 3: Surgical Guard Patching
 * Disables guards on specific routes without breaking router
 */

const patchRouteGuards = (router) => {
  console.log('🔧 Patching route guards surgically...');

  // Method 1: Clear global guards (already doing this)
  router.beforeHooks = [];
  router.beforeResolveHooks = [];
  console.log('✅ Cleared global guards');

  // Method 2: Patch route records
  const patchRouteRecord = (route) => {
    if (route.beforeEnter) {
      console.log(`🔧 Patching beforeEnter on route: ${route.path}`);
      route.beforeEnter = (to, from, next) => {
        console.log(`🚪 Bypassed guard on ${route.path}`);
        next(); // Always allow
      };
    }

    if (route.children) {
      route.children.forEach(patchRouteRecord);
    }
  };

  router.options.routes.forEach(patchRouteRecord);
  console.log('✅ Patched route-level guards');

  // Method 3: Intercept router.resolve to bypass guards
  const originalResolve = router.resolve.bind(router);
  router.resolve = function(to, currentLocation) {
    const resolved = originalResolve(to, currentLocation);

    // Clear guards from matched routes
    resolved.matched.forEach(record => {
      if (record.beforeEnter) {
        record.beforeEnter = (to, from, next) => next();
      }
      // Also clear component guards
      if (record.components?.default?.beforeRouteEnter) {
        record.components.default.beforeRouteEnter = (to, from, next) => next();
      }
    });

    return resolved;
  };
  console.log('✅ Intercepted router.resolve');

  // Method 4: Monkey-patch router.push to skip guards
  const originalPush = router.push.bind(router);
  router.push = async function(to) {
    console.log('🚀 Intercepted router.push to:', to);

    // Temporarily clear all guards
    const savedBeforeHooks = [...router.beforeHooks];
    const savedResolveHooks = [...router.beforeResolveHooks];

    router.beforeHooks = [];
    router.beforeResolveHooks = [];

    try {
      const result = await originalPush(to);
      console.log('✅ Navigation succeeded');
      return result;
    } catch (e) {
      console.error('❌ Navigation failed:', e);
      throw e;
    } finally {
      // Don't restore hooks - keep them cleared
      // router.beforeHooks = savedBeforeHooks;
      // router.beforeResolveHooks = savedResolveHooks;
    }
  };
  console.log('✅ Monkey-patched router.push');
};

// Usage
const surgicalPatchSolution = () => {
  const vueApp = window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0];
  const router = vueApp?.config?.globalProperties?.$router;

  if (!router) {
    console.error('❌ Router not found');
    return;
  }

  patchRouteGuards(router);

  // Now try navigation
  setTimeout(() => {
    router.push('/dashboard');
    console.log('🚀 Navigation attempted with patched router');
  }, 500);
};
```

### Will This Work?

**⚠️ Partial Success Expected:**
- Global guards: ✅ Already cleared, works
- Route-level guards: ⚠️ Might work if we patch `router.options.routes`
- Component guards: ❌ Hard to patch (inside component definition)
- Dynamic guards: ❌ If guards check state dynamically, patching function won't help

**Likelihood of Success: 5/10**
- Better than replacement
- But component guards are hard to patch

---

## Approach 4: Auth State Interception

### The Idea
Don't fight the router - make it THINK auth succeeded.

### Research Findings

**Why Route Guards Fail:**
Guards check conditions like:
```javascript
if (!store.state.auth.authenticated) return next('/');
if (!store.state.user.id) return next('/');
if (!firebase.auth().currentUser) return next('/');
```

**The Insight:**
We're already injecting Vuex state, but guards might check:
- Vuex getters (not just state)
- Firebase auth object
- localStorage with specific keys
- Cookies with specific names
- Function calls that return auth status

**Sources:**
- [Component Registration | Vue.js](https://vuejs.org/guide/components/registration.html)
- [Vue Context Argument | LearnVue](https://learnvue.co/articles/vue-context-argument)

### Implementation

```javascript
/**
 * APPROACH 4: Deep Auth State Interception
 * Make the app THINK authentication succeeded
 */

const interceptAuthAtEveryLevel = (vueApp, store) => {
  console.log('🔐 Intercepting auth at all levels...');

  // Level 1: Vuex State (already doing)
  if (!store.state.auth) {
    store.state.auth = {};
  }

  Object.defineProperty(store.state, 'auth', {
    get: () => {
      return new Proxy({}, {
        get: (target, prop) => {
          console.log(`🔍 Auth check: store.state.auth.${prop}`);

          // Return appropriate values for common auth checks
          if (prop === 'authenticated' || prop === 'isAuthenticated') return true;
          if (prop === 'token' || prop === 'accessToken') return 'mock_jwt_token_' + Date.now();
          if (prop === 'user') return {
            id: 'mock_user_123',
            email: 'demo@example.com',
            name: 'Demo User',
            role: 'admin'
          };
          if (prop === 'loggedIn') return true;
          if (prop === 'isLoggedIn') return true;

          return target[prop] || true; // Default to truthy
        }
      });
    },
    configurable: true
  });

  // Level 2: Vuex Getters
  if (store.getters) {
    const originalGetters = { ...store.getters };

    Object.keys(originalGetters).forEach(key => {
      if (key.includes('auth') || key.includes('Auth') || key.includes('logged')) {
        Object.defineProperty(store.getters, key, {
          get: () => {
            console.log(`🔍 Getter check: ${key}`);

            // Return appropriate value based on getter name
            if (key.includes('authenticated') || key.includes('isLogged')) {
              return true;
            }
            if (key.includes('token')) {
              return 'mock_jwt_token_' + Date.now();
            }
            if (key.includes('user') || key.includes('User')) {
              return {
                id: 'mock_user_123',
                email: 'demo@example.com',
                name: 'Demo User'
              };
            }

            return true; // Default
          },
          configurable: true
        });
      }
    });

    console.log('✅ Intercepted Vuex getters');
  }

  // Level 3: Firebase Auth
  if (window.firebase) {
    console.log('🔥 Intercepting Firebase auth...');

    const mockUser = {
      uid: 'mock_user_123',
      email: 'demo@example.com',
      displayName: 'Demo User',
      emailVerified: true,
      photoURL: null,
      phoneNumber: null,
      getIdToken: () => Promise.resolve('mock_firebase_token_' + Date.now()),
      getIdTokenResult: () => Promise.resolve({
        token: 'mock_firebase_token_' + Date.now(),
        claims: { admin: true }
      }),
      reload: () => Promise.resolve(),
      toJSON: () => mockUser
    };

    window.firebase.auth = () => ({
      currentUser: mockUser,
      onAuthStateChanged: (callback) => {
        setTimeout(() => callback(mockUser), 0);
        return () => {}; // Unsubscribe
      },
      onIdTokenChanged: (callback) => {
        setTimeout(() => callback(mockUser), 0);
        return () => {};
      },
      signInWithCustomToken: () => Promise.resolve({ user: mockUser }),
      signOut: () => Promise.resolve()
    });

    console.log('✅ Firebase auth mocked');
  }

  // Level 4: Common auth utility functions
  // Some apps have global auth check functions
  const authFunctionNames = [
    'isAuthenticated',
    'isLoggedIn',
    'checkAuth',
    'hasAuth',
    'isAuth'
  ];

  authFunctionNames.forEach(name => {
    if (typeof window[name] === 'undefined') {
      window[name] = () => {
        console.log(`🔍 Auth function called: ${name}()`);
        return true;
      };
    }
  });

  console.log('✅ Injected global auth functions');
};

// Usage
const authInterceptionSolution = () => {
  const vueApp = window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0];
  const store = vueApp?.config?.globalProperties?.$store;
  const router = vueApp?.config?.globalProperties?.$router;

  if (!store) {
    console.error('❌ Vuex store not found');
    return;
  }

  // Intercept auth at all levels
  interceptAuthAtEveryLevel(vueApp, store);

  // Clear router guards
  if (router) {
    router.beforeHooks = [];
    router.beforeResolveHooks = [];
  }

  // Wait for auth state to settle
  setTimeout(() => {
    if (router) {
      router.push('/dashboard');
      console.log('🚀 Navigation attempted with full auth interception');
    }
  }, 1000);
};
```

### Will This Work?

**✅ This Is The Most Elegant:**
- Works WITH the router, not against it
- Preserves app functionality
- Route guards pass naturally
- No component mounting hacks

**Likelihood of Success: 8/10**
- Addresses root cause (auth checks failing)
- Most generalizable approach
- Might still miss some obscure checks

---

## Philosophical Analysis

### Elegance Comparison

| Approach | Elegance | Reasoning |
|----------|----------|-----------|
| 1. Direct Mount | 3/10 | Breaks navigation, component context issues |
| 2. Router Replace | 2/10 | Very hacky, high risk of breaking app |
| 3. Guard Patching | 5/10 | Clever but fighting against architecture |
| 4. Auth Interception | **9/10** | Works WITH system, preserves functionality |

### Success Likelihood

| Approach | Success | Reasoning |
|----------|---------|-----------|
| 1. Direct Mount | 6/10 | Will mount but functionality broken |
| 2. Router Replace | 4/10 | Too many ways to break |
| 3. Guard Patching | 5/10 | Misses component-level guards |
| 4. Auth Interception | **8/10** | Addresses actual problem |

### Generalizability

| Approach | Generalizability | Reasoning |
|----------|------------------|-----------|
| 1. Direct Mount | 4/10 | Every app has different component names |
| 2. Router Replace | 3/10 | Too app-specific, risky |
| 3. Guard Patching | 6/10 | Works for some apps, not all |
| 4. Auth Interception | **9/10** | Auth checks are universal pattern |

---

## Final Recommendation

### The Winner: Approach 4 (Auth State Interception)

**Why This Is The Right Direction:**

1. **Addresses Root Cause**: Router isn't the problem - failed auth checks are
2. **Preserves Functionality**: App works normally after guards pass
3. **Most Universal**: Every app checks auth similarly (Vuex, getters, Firebase)
4. **Elegant**: Works WITH Vue/Router, not against them

### Enhanced Implementation Strategy

```javascript
/**
 * FINAL SOLUTION: Multi-Layer Auth Interception
 * Combines best practices from research
 */

class AuthBypass {
  constructor(vueApp) {
    this.vueApp = vueApp;
    this.store = vueApp?.config?.globalProperties?.$store;
    this.router = vueApp?.config?.globalProperties?.$router;
    this.intercepted = new Set();
  }

  // Layer 1: Vuex State Proxy (highest priority)
  interceptVuexState() {
    if (!this.store?.state) return;

    // Intercept auth object
    const authProxy = new Proxy({}, {
      get: (target, prop) => {
        this.log(`Auth check: state.auth.${prop}`);
        return this.getAuthValue(prop);
      }
    });

    Object.defineProperty(this.store.state, 'auth', {
      get: () => authProxy,
      set: () => {}, // Ignore sets
      configurable: true
    });

    this.intercepted.add('vuex-state');
  }

  // Layer 2: Vuex Getters (computed properties)
  interceptVuexGetters() {
    if (!this.store?.getters) return;

    Object.keys(this.store.getters).forEach(key => {
      if (this.isAuthGetter(key)) {
        const descriptor = {
          get: () => {
            this.log(`Getter check: ${key}`);
            return this.getAuthValue(key);
          },
          configurable: true
        };

        try {
          Object.defineProperty(this.store.getters, key, descriptor);
        } catch (e) {
          // Some getters might not be configurable
        }
      }
    });

    this.intercepted.add('vuex-getters');
  }

  // Layer 3: Firebase Auth (if present)
  interceptFirebase() {
    if (!window.firebase) return;

    const mockUser = this.createMockFirebaseUser();
    window.firebase.auth = () => ({
      currentUser: mockUser,
      onAuthStateChanged: (cb) => { setTimeout(() => cb(mockUser), 0); return () => {}; },
      onIdTokenChanged: (cb) => { setTimeout(() => cb(mockUser), 0); return () => {}; }
    });

    this.intercepted.add('firebase');
  }

  // Layer 4: Router Guards (last resort)
  interceptRouterGuards() {
    if (!this.router) return;

    this.router.beforeHooks = [];
    this.router.beforeResolveHooks = [];

    // Monkey-patch router.push to temporarily disable guards
    const originalPush = this.router.push.bind(this.router);
    this.router.push = async function(to) {
      const savedHooks = [...this.beforeHooks];
      this.beforeHooks = [];

      try {
        return await originalPush(to);
      } finally {
        // Keep guards cleared
      }
    };

    this.intercepted.add('router-guards');
  }

  // Execute all layers
  bypass() {
    console.log('🔐 Starting multi-layer auth bypass...');

    this.interceptVuexState();
    this.interceptVuexGetters();
    this.interceptFirebase();
    this.interceptRouterGuards();

    console.log('✅ Bypassed:', Array.from(this.intercepted).join(', '));

    // Navigate after all intercepts active
    setTimeout(() => {
      if (this.router) {
        this.router.push('/dashboard');
      }
    }, 500);
  }

  // Helper: Determine if getter is auth-related
  isAuthGetter(name) {
    const keywords = ['auth', 'logged', 'token', 'user', 'session'];
    return keywords.some(kw => name.toLowerCase().includes(kw));
  }

  // Helper: Return appropriate auth value
  getAuthValue(prop) {
    const propLower = prop.toLowerCase();

    if (propLower.includes('authenticated') || propLower.includes('logged')) {
      return true;
    }
    if (propLower.includes('token')) {
      return 'mock_jwt_token_' + Date.now();
    }
    if (propLower.includes('user')) {
      return {
        id: 'mock_user_123',
        email: 'demo@example.com',
        name: 'Demo User',
        role: 'admin'
      };
    }

    return true; // Safe default
  }

  // Helper: Create mock Firebase user
  createMockFirebaseUser() {
    return {
      uid: 'mock_user_123',
      email: 'demo@example.com',
      displayName: 'Demo User',
      emailVerified: true,
      getIdToken: () => Promise.resolve('mock_firebase_token'),
      getIdTokenResult: () => Promise.resolve({
        token: 'mock_firebase_token',
        claims: { admin: true }
      })
    };
  }

  log(msg) {
    console.log(`🔐 [AuthBypass] ${msg}`);
  }
}

// Usage
const implementAuthBypass = () => {
  const vueApp = window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0];

  if (!vueApp) {
    console.error('❌ Vue app not found');
    return;
  }

  const bypass = new AuthBypass(vueApp);
  bypass.bypass();
};
```

---

## Conclusion

### Answer to Original Question

**"Can we bypass the router entirely and directly mount the dashboard component?"**

**Technical Answer**: Yes, but you shouldn't.

**Philosophical Answer**: The router isn't the enemy. Failed auth checks are.

### The Most Elegant Solution

**Multi-layer auth interception** (Approach 4) because:

1. **Elegant**: Works with Vue's architecture, not against it
2. **Effective**: Addresses root cause (failed auth checks)
3. **Universal**: Auth patterns are consistent across apps
4. **Maintainable**: Clear, understandable approach
5. **Preserves Functionality**: App works normally after bypass

### Ratings Summary

| Metric | Score | Notes |
|--------|-------|-------|
| **Elegance** | 9/10 | Clean, architectural |
| **Success Likelihood** | 8/10 | High confidence |
| **Generalizability** | 9/10 | Works across apps |
| **Overall** | **8.7/10** | **Recommended approach** |

### Implementation Plan

1. ✅ Keep existing Vuex state injection
2. ✅ Add Proxy-based auth interception (all properties)
3. ✅ Add Vuex getter interception
4. ✅ Add Firebase auth mocking
5. ✅ Keep router guard clearing as safety net
6. ✅ Test on GHL

This combines the best of all approaches into a robust, elegant solution.

---

## Sources

### Vue 3 Mounting & Component APIs
- [Creating a Vue Application | Vue.js](https://vuejs.org/guide/essentials/application.html)
- [Programmatically create and mount component · Issue #1802](https://github.com/vuejs/core/issues/1802)
- [mount-vue-component utility](https://github.com/pearofducks/mount-vue-component)
- [Improve rendering components programmatically · Discussion #582](https://github.com/vuejs/rfcs/discussions/582)
- [Render Functions & JSX | Vue.js](https://vuejs.org/guide/extras/render-function.html)
- [Dissecting Vue 3: The Mounting Process](https://medium.com/glovo-engineering/dissecting-vue-3-the-mounting-process-i-32181abf5cc3)

### Vue Router & Navigation Guards
- [Navigation Guards | Vue Router](https://router.vuejs.org/guide/advanced/navigation-guards.html)
- [Router Interface | Vue Router](https://router.vuejs.org/api/interfaces/router)
- [Programmatic Navigation | Vue Router](https://router.vuejs.org/guide/essentials/navigation.html)
- [Route Meta Fields | Vue Router](https://router.vuejs.org/guide/advanced/meta.html)

### Component Registration & Context
- [Component Registration | Vue.js](https://vuejs.org/guide/components/registration.html)
- [Vue Context Argument | LearnVue](https://learnvue.co/articles/vue-context-argument)
- [Register global components dynamically](https://dev.to/jirehnimes/how-to-register-global-components-in-vue-3-dynamically-in-2023-1d50)
