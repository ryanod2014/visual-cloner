# GHL Auth Bypass - Hypotheses & Solutions

**Date**: January 10, 2026
**Goal**: Find elegant solution for 100% app compatibility
**Current Blocker**: Route-level guards prevent navigation to /dashboard

---

## Problem Statement

**What We Know**:
- Vuex state is correctly mocked (`locationsLoaded: true`, user/company data injected)
- `beforeEach` and `beforeResolve` hooks cleared
- Navigation attempted via `router.push('/dashboard')` fails silently
- Route stays at `/` (login) with only 4 DOM elements
- GHL has route-level `beforeEnter` guards that check auth state

**Root Cause**:
```javascript
// GHL's dashboard route (somewhere in compiled app.js)
{
  path: '/dashboard',
  beforeEnter: (to, from, next) => {
    // These checks fail despite our Vuex mocking:
    if (!this.$store.state.auth.authenticated) return next('/');
    if (!this.$store.state.auth.token) return next('/');
    if (!firebase.auth().currentUser) return next('/');
    next(); // Never reaches here
  }
}
```

---

## Hypotheses to Test

### Hypothesis 1: Route Guard Patching via Router Internals

**Theory**: We can intercept Vue Router's route resolution before guards execute.

**Approach**:
- Access `router.options.routes` and modify `beforeEnter` functions
- Or patch `router.matcher` to skip guard execution
- Or override `router.resolve()` to always allow navigation

**Implementation Ideas**:
```javascript
// Approach A: Clear beforeEnter guards from route definitions
router.options.routes.forEach(route => {
  if (route.beforeEnter) {
    route.beforeEnter = (to, from, next) => next(); // Always allow
  }
});

// Approach B: Patch the matcher
const originalResolve = router.resolve.bind(router);
router.resolve = (...args) => {
  const resolved = originalResolve(...args);
  // Skip guard checks somehow?
  return resolved;
};

// Approach C: Patch router.beforeResolve
router.beforeResolve((to, from, next) => {
  next(); // Override all guards
});
```

**Challenges**:
- Routes may be lazily loaded
- Guards may be in component definitions, not route config
- Vue Router internals are complex

**Testing Agent**: Will explore Vue Router source code and GHL's route structure

---

### Hypothesis 2: Firebase Auth State Complete Mocking

**Theory**: GHL checks Firebase's real-time auth state, not just Vuex.

**Approach**:
- Mock `firebase.auth().currentUser` to return proper user object
- Mock `firebase.auth().onAuthStateChanged()` to immediately call callback with user
- Ensure Firebase SDK's internal state is satisfied

**Implementation Ideas**:
```javascript
// Create fake Firebase auth object
if (window.firebase) {
  const mockUser = {
    uid: 'mock_user_123',
    email: 'demo@example.com',
    displayName: 'Demo User',
    emailVerified: true,
    getIdToken: () => Promise.resolve('mock_token_' + Date.now())
  };

  window.firebase.auth = () => ({
    currentUser: mockUser,
    onAuthStateChanged: (callback) => {
      setTimeout(() => callback(mockUser), 0);
      return () => {}; // Unsubscribe function
    },
    signInWithCustomToken: () => Promise.resolve({ user: mockUser })
  });
}
```

**Challenges**:
- Firebase SDK might be deeply integrated
- Multiple auth state listeners throughout app
- Token validation might happen server-side

**Testing Agent**: Will research Firebase auth mocking and GHL's Firebase integration

---

### Hypothesis 3: Auth State Deep Inspection & Precise Mocking

**Theory**: GHL checks specific nested auth properties we haven't identified.

**Approach**:
- Inspect the compiled `app.js` to find exact auth checks
- Use browser devtools to search for auth-related code
- Identify EXACT properties that route guards check

**Implementation Ideas**:
```javascript
// Find what GHL actually checks:
// 1. Search app.js for "auth.authenticated" or similar
// 2. Set up Proxy that logs ALL property accesses:

store.state.auth = new Proxy(store.state.auth || {}, {
  get: (target, prop) => {
    console.log(`[AUTH CHECK] store.state.auth.${prop} accessed`);
    // Return appropriate value based on property name
    if (prop === 'authenticated') return true;
    if (prop === 'token') return 'mock_jwt_token';
    if (prop === 'user') return { id: 'mock_user_123', ... };
    return target[prop];
  }
});
```

**Challenges**:
- Minified code is hard to read
- Properties might be obfuscated
- Checks might be indirect (functions, getters)

**Testing Agent**: Will analyze app.js bundle and trace auth checks

---

### Hypothesis 4: Direct Component Mounting (Nuclear Option)

**Theory**: Bypass router entirely and force-mount dashboard component.

**Approach**:
- Find dashboard component in Vue's component registry
- Manually create component instance
- Mount it to DOM, bypassing all routing logic

**Implementation Ideas**:
```javascript
// Access Vue app's component registry
const app = capturedVueApp;
const Dashboard = app._context.components.Dashboard ||
                  app._context.components.DashboardView ||
                  Object.values(app._context.components).find(c =>
                    c.name?.includes('Dashboard')
                  );

if (Dashboard) {
  // Create instance and mount
  const dashboardInstance = createApp(Dashboard);
  dashboardInstance.use(store);
  dashboardInstance.mount('#app');
}
```

**Challenges**:
- Component name might be minified
- Dashboard might depend on route context
- Breaks router completely (not elegant)

**Testing Agent**: Will explore Vue 3 component mounting APIs

---

### Hypothesis 5: History API Override & URL Manipulation

**Theory**: GHL checks window.location or history state, not just router.

**Approach**:
- Override `window.location.pathname` getter to return `/dashboard`
- Mock `history.pushState` to update internal state
- Trick app into thinking it's on dashboard route

**Implementation Ideas**:
```javascript
// Override location.pathname
Object.defineProperty(window.location, 'pathname', {
  get: () => '/dashboard',
  set: () => {},
  configurable: true
});

// Override history
const originalPushState = history.pushState.bind(history);
history.pushState = function(state, title, url) {
  originalPushState(state, title, '/dashboard');
};
```

**Challenges**:
- Many apps use router, not raw location
- Can cause infinite redirect loops
- Might break other navigation

**Testing Agent**: Will test URL manipulation approach

---

### Hypothesis 6: Mutation Timing & Async Init Sequence

**Theory**: We trigger mutations too early, before GHL's init sequence completes.

**Approach**:
- Wait for specific GHL initialization events
- Trigger mutations in exact sequence GHL expects
- Hook into GHL's own init logic

**Implementation Ideas**:
```javascript
// Wait for GHL's init to complete
const waitForGHLInit = () => {
  return new Promise(resolve => {
    const check = () => {
      if (store.state.initialized &&
          store.state.auth &&
          store._actions['auth/login']) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
};

// Then trigger auth in correct sequence
await waitForGHLInit();
await store.dispatch('auth/login', mockUser);
await router.push('/dashboard');
```

**Challenges**:
- Hard to know correct sequence
- Async timing is tricky
- May still hit route guards

**Testing Agent**: Will analyze GHL's initialization sequence

---

## Long-Term Architecture Alignment

**Key Insight**: A 100% solution needs to be **layered**:

1. **Layer 1: Generic Interception** (Current - Works for 80%)
   - localStorage/fetch/XHR mocking
   - Basic Vuex state injection
   - Error suppression

2. **Layer 2: Framework-Specific Adapters** (New - Gets us to 95%)
   - Vue Router guard override
   - Firebase auth mocking
   - React Context injection
   - Angular service mocking

3. **Layer 3: App-Specific Plugins** (Final 5%)
   - GHL auth flow
   - Salesforce OAuth
   - Custom auth systems

**Elegant Solution Requirements**:
- ✅ Must work automatically (no manual config)
- ✅ Must be framework-agnostic (Vue, React, Angular)
- ✅ Must be maintainable (clear, documented)
- ✅ Must be fast (no user-visible delays)
- ✅ Must preserve app functionality (not break features)

---

## Testing Plan

**Phase 1**: Parallel hypothesis testing (4 agents simultaneously)
- Agent 1: Route guard patching
- Agent 2: Firebase auth mocking
- Agent 3: Auth state inspection
- Agent 4: Direct component mounting

**Phase 2**: Synthesize best approach
- Combine successful techniques
- Design elegant API
- Implement in auto-mocker

**Phase 3**: Validate on GHL
- Test dashboard renders
- Test functionality works
- Test no side effects

**Phase 4**: Generalize for all apps
- Extract patterns into framework adapters
- Document approach
- Create plugin system

---

## Success Criteria

**Minimum Viable**:
- GHL dashboard renders
- Basic navigation works
- No console errors

**Ideal**:
- Works on first load
- No timing issues
- Fully functional dashboard
- Generalizes to other complex apps

**Perfect**:
- Automatic detection of auth patterns
- Self-configuring for any app
- Plugin system for edge cases
- Works on 100% of apps (with or without plugins)

---

## Next Steps

1. Launch 4 parallel research agents
2. Each agent investigates one hypothesis
3. Report findings with code samples
4. Synthesize into elegant solution
5. Implement and test on GHL
6. Document for long-term architecture
