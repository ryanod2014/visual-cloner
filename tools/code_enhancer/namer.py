"""
Heuristic-Based Variable and Function Naming
Infers meaningful names from usage patterns without AI
"""

import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field


@dataclass
class NameSuggestion:
    """A suggested name for a variable/function"""
    original: str
    suggested: str
    confidence: float  # 0-1
    reason: str
    context: str = ""


@dataclass
class NamingResult:
    """Results from naming analysis"""
    file_path: Path
    suggestions: List[NameSuggestion]
    renamed_code: str
    variables_renamed: int
    functions_renamed: int


class HeuristicNamer:
    """
    Infers meaningful variable/function names from usage patterns.
    Uses rule-based heuristics - no AI required.
    """

    # Common API patterns that reveal variable purposes
    API_PATTERNS = {
        # Fetch/HTTP patterns
        r'fetch\s*\(\s*(\w+)': ('url', 'endpoint'),
        r'\.get\s*\(\s*(\w+)': ('url', 'endpoint'),
        r'\.post\s*\(\s*(\w+)': ('url', 'endpoint'),
        r'\.put\s*\(\s*(\w+)': ('url', 'endpoint'),
        r'\.delete\s*\(\s*(\w+)': ('url', 'endpoint'),
        r'axios\s*\(\s*{\s*url\s*:\s*(\w+)': ('url', 'endpoint'),

        # Response patterns
        r'(\w+)\.status\s*===?\s*\d+': ('response', 'res'),
        r'(\w+)\.ok\b': ('response', 'res'),
        r'(\w+)\.json\s*\(\s*\)': ('response', 'res'),
        r'(\w+)\.text\s*\(\s*\)': ('response', 'res'),
        r'(\w+)\.data\b': ('response', 'res'),
        r'(\w+)\.body\b': ('request', 'response'),

        # Error patterns
        r'catch\s*\(\s*(\w+)\s*\)': ('error', 'err'),
        r'(\w+)\.message\b': ('error', 'err'),
        r'(\w+)\.stack\b': ('error', 'err'),
        r'throw\s+(\w+)': ('error', 'err'),

        # Event patterns
        r'addEventListener\s*\(\s*["\'](\w+)["\']': None,  # Event type, not variable
        r'(\w+)\.target\b': ('event', 'e'),
        r'(\w+)\.preventDefault': ('event', 'e'),
        r'(\w+)\.stopPropagation': ('event', 'e'),
        r'(\w+)\.currentTarget': ('event', 'e'),
        r'(\w+)\.keyCode': ('event', 'keyEvent'),
        r'(\w+)\.clientX': ('event', 'mouseEvent'),

        # DOM patterns
        r'document\.getElementById\s*\(\s*(\w+)\s*\)': ('elementId', 'id'),
        r'document\.querySelector\s*\(\s*(\w+)\s*\)': ('selector', 'query'),
        r'(\w+)\.appendChild': ('element', 'el'),
        r'(\w+)\.innerHTML': ('element', 'el'),
        r'(\w+)\.classList': ('element', 'el'),
        r'(\w+)\.style\b': ('element', 'el'),
        r'(\w+)\.setAttribute': ('element', 'el'),

        # Storage patterns
        r'localStorage\.getItem\s*\(\s*(\w+)\s*\)': ('key', 'storageKey'),
        r'localStorage\.setItem\s*\(\s*(\w+)\s*,': ('key', 'storageKey'),
        r'sessionStorage\.getItem\s*\(\s*(\w+)\s*\)': ('key', 'storageKey'),

        # Auth patterns
        r'Bearer\s+["\']?\s*\+?\s*(\w+)': ('token', 'authToken'),
        r'Authorization.*(\w+)': ('token', 'authToken'),
        r'(\w+)\.token\b': ('auth', 'authData'),
        r'(\w+)\.accessToken': ('auth', 'authData'),
        r'(\w+)\.refreshToken': ('auth', 'tokenData'),

        # User patterns
        r'(\w+)\.userId': ('user', 'userData'),
        r'(\w+)\.username': ('user', 'userData'),
        r'(\w+)\.email': ('user', 'userData'),
        r'(\w+)\.password': ('credentials', 'creds'),

        # Array patterns
        r'(\w+)\.map\s*\(': ('array', 'items'),
        r'(\w+)\.filter\s*\(': ('array', 'items'),
        r'(\w+)\.reduce\s*\(': ('array', 'items'),
        r'(\w+)\.forEach\s*\(': ('array', 'items'),
        r'(\w+)\.find\s*\(': ('array', 'items'),
        r'(\w+)\.length\b': ('array', 'list'),
        r'(\w+)\[(\w+)\]': None,  # Index access - handle separately

        # Promise patterns
        r'(\w+)\.then\s*\(': ('promise', 'result'),
        r'await\s+(\w+)': ('promise', 'asyncResult'),

        # JSON patterns
        r'JSON\.parse\s*\(\s*(\w+)\s*\)': ('jsonString', 'raw'),
        r'JSON\.stringify\s*\(\s*(\w+)\s*\)': ('data', 'obj'),

        # Timer patterns
        r'setTimeout\s*\(\s*(\w+)': ('callback', 'fn'),
        r'setInterval\s*\(\s*(\w+)': ('callback', 'fn'),
        r'clearTimeout\s*\(\s*(\w+)': ('timerId', 'timer'),
        r'clearInterval\s*\(\s*(\w+)': ('intervalId', 'interval'),

        # ===================
        # Vue.js Patterns
        # ===================

        # Vue instance/component patterns
        r'\$emit\s*\(\s*["\'](\w+)["\']': None,  # Event name, not variable
        r'(\w+)\.\$emit\s*\(': ('component', 'vueInstance'),
        r'(\w+)\.\$refs\b': ('component', 'vueInstance'),
        r'\$refs\.(\w+)': None,  # Ref name, not variable
        r'\$refs\[(\w+)\]': ('refName', 'elementRef'),
        r'(\w+)\.\$store\b': ('component', 'vueInstance'),
        r'\$store\.state\.(\w+)': None,  # State property name
        r'\$store\.getters\.(\w+)': None,  # Getter name
        r'(\w+)\.\$router\b': ('component', 'vueInstance'),
        r'(\w+)\.\$route\b': ('component', 'vueInstance'),
        r'\$route\.params\.(\w+)': None,  # Param name
        r'\$route\.query\.(\w+)': None,  # Query name
        r'\$route\.params\[(\w+)\]': ('paramKey', 'routeParam'),
        r'\$route\.query\[(\w+)\]': ('queryKey', 'routeQuery'),

        # Vue component options
        r'props:\s*\[.*?(\w+)': None,  # Prop name in array syntax
        r'props:\s*\{[^}]*(\w+)\s*:': None,  # Prop name in object syntax
        r'(\w+)\.\$props\b': ('component', 'vueInstance'),
        r'(\w+)\.\$data\b': ('component', 'vueInstance'),
        r'(\w+)\.\$options\b': ('component', 'vueInstance'),

        # Vue reactivity
        r'ref\s*\(\s*(\w+)\s*\)': ('initialValue', 'refValue'),
        r'reactive\s*\(\s*(\w+)\s*\)': ('initialState', 'reactiveState'),
        r'computed\s*\(\s*(\w+)\s*\)': ('getter', 'computedFn'),
        r'watch\s*\(\s*(\w+)\s*,': ('watchSource', 'reactive'),
        r'watchEffect\s*\(\s*(\w+)\s*\)': ('effectFn', 'sideEffect'),
        r'toRef\s*\(\s*(\w+)\s*,': ('sourceObject', 'reactiveObj'),
        r'toRefs\s*\(\s*(\w+)\s*\)': ('reactiveObject', 'stateObj'),
        r'(\w+)\.value\b': ('ref', 'reactiveRef'),

        # Vue directives (v-model, v-bind, v-on related)
        r'v-model\s*=\s*["\'](\w+)["\']': None,  # Model binding name
        r'v-bind:(\w+)': None,  # Bound prop name
        r':(\w+)\s*=': None,  # Shorthand v-bind
        r'v-on:(\w+)': None,  # Event name
        r'@(\w+)\s*=': None,  # Shorthand v-on

        # ===================
        # Vuex Patterns
        # ===================

        # Vuex store patterns
        r'commit\s*\(\s*["\'](\w+)["\']': None,  # Mutation name
        r'(\w+)\.commit\s*\(': ('store', 'vuexStore'),
        r'dispatch\s*\(\s*["\'](\w+)["\']': None,  # Action name
        r'(\w+)\.dispatch\s*\(': ('store', 'vuexStore'),
        r'state\.(\w+)': None,  # State property name
        r'getters\.(\w+)': None,  # Getter name
        r'getters\[(\w+)\]': ('getterName', 'dynamicGetter'),
        r'rootState\.(\w+)': None,  # Root state property
        r'rootGetters\.(\w+)': None,  # Root getter name
        r'(\w+)\.state\b(?!\s*=)': ('store', 'vuexStore'),
        r'(\w+)\.getters\b': ('store', 'vuexStore'),

        # Vuex helpers
        r'mapState\s*\(\s*(\w+)\s*\)': ('namespace', 'storeModule'),
        r'mapState\s*\(\s*\[': None,  # Array syntax
        r'mapGetters\s*\(\s*(\w+)\s*\)': ('namespace', 'storeModule'),
        r'mapGetters\s*\(\s*\[': None,  # Array syntax
        r'mapActions\s*\(\s*(\w+)\s*\)': ('namespace', 'storeModule'),
        r'mapActions\s*\(\s*\[': None,  # Array syntax
        r'mapMutations\s*\(\s*(\w+)\s*\)': ('namespace', 'storeModule'),
        r'mapMutations\s*\(\s*\[': None,  # Array syntax
        r'createNamespacedHelpers\s*\(\s*(\w+)\s*\)': ('namespace', 'moduleName'),

        # Vuex module patterns
        r'modules:\s*\{[^}]*(\w+)\s*:': None,  # Module name
        r'namespaced:\s*(\w+)': ('flag', 'isNamespaced'),

        # ===================
        # Vue Router Patterns
        # ===================

        # Router navigation
        r'router\.push\s*\(\s*(\w+)\s*\)': ('route', 'destination'),
        r'router\.push\s*\(\s*\{[^}]*path\s*:\s*(\w+)': ('routePath', 'path'),
        r'router\.push\s*\(\s*\{[^}]*name\s*:\s*(\w+)': ('routeName', 'name'),
        r'router\.replace\s*\(\s*(\w+)\s*\)': ('route', 'destination'),
        r'router\.go\s*\(\s*(\w+)\s*\)': ('offset', 'historyOffset'),
        r'(\w+)\.push\s*\(\s*\{[^}]*path\s*:': ('router', 'vueRouter'),
        r'(\w+)\.replace\s*\(\s*\{[^}]*path\s*:': ('router', 'vueRouter'),

        # Route object properties
        r'route\.params\.(\w+)': None,  # Param name
        r'route\.query\.(\w+)': None,  # Query name
        r'route\.hash\b': None,  # Hash access
        r'route\.fullPath\b': None,  # Full path access
        r'(\w+)\.params\b': ('route', 'currentRoute'),
        r'(\w+)\.query\b': ('route', 'currentRoute'),
        r'(\w+)\.meta\b': ('route', 'currentRoute'),
        r'(\w+)\.matched\b': ('route', 'currentRoute'),

        # Navigation guards
        r'beforeEnter\s*:\s*(\w+)': ('guard', 'routeGuard'),
        r'beforeRouteEnter\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)': None,  # to, from, next
        r'beforeRouteLeave\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)': None,  # to, from, next
        r'beforeRouteUpdate\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)': None,  # to, from, next
        r'beforeEach\s*\(\s*(\w+)\s*\)': ('guardFn', 'navigationGuard'),
        r'afterEach\s*\(\s*(\w+)\s*\)': ('hookFn', 'afterHook'),
        r'router\.beforeEach': None,  # Method call
        r'router\.afterEach': None,  # Method call
    }

    # Function name patterns based on what they do
    FUNCTION_PATTERNS = {
        r'return\s+true\s*;?\s*$': ('isValid', 'check'),
        r'return\s+false\s*;?\s*$': ('isInvalid', 'check'),
        r'window\.location': ('redirect', 'navigate'),
        r'fetch\s*\(': ('fetchData', 'request'),
        r'localStorage': ('storage', 'persist'),
        r'addEventListener': ('bindEvent', 'setupListener'),
        r'removeEventListener': ('unbindEvent', 'removeListener'),
        r'document\.createElement': ('createElement', 'buildElement'),
        r'\.innerHTML\s*=': ('render', 'updateDOM'),
        r'console\.log': ('debug', 'log'),
        r'throw\s+new\s+Error': ('throwError', 'raiseError'),
        r'new\s+Promise': ('createPromise', 'async'),
        r'async\s+function|=>\s*{?\s*await': ('asyncHandler', 'async'),

        # ===================
        # Vue.js Function Patterns
        # ===================

        # Vue component lifecycle
        r'\bdata\s*\(\s*\)\s*\{': ('getData', 'initData'),
        r'\bcreated\s*\(\s*\)\s*\{': ('onCreated', 'created'),
        r'\bmounted\s*\(\s*\)\s*\{': ('onMounted', 'mounted'),
        r'\bupdated\s*\(\s*\)\s*\{': ('onUpdated', 'updated'),
        r'\bdestroyed\s*\(\s*\)\s*\{': ('onDestroyed', 'destroyed'),
        r'\bbeforeCreate\s*\(\s*\)\s*\{': ('onBeforeCreate', 'beforeCreate'),
        r'\bbeforeMount\s*\(\s*\)\s*\{': ('onBeforeMount', 'beforeMount'),
        r'\bbeforeUpdate\s*\(\s*\)\s*\{': ('onBeforeUpdate', 'beforeUpdate'),
        r'\bbeforeDestroy\s*\(\s*\)\s*\{': ('onBeforeDestroy', 'beforeDestroy'),
        r'\bactivated\s*\(\s*\)\s*\{': ('onActivated', 'activated'),
        r'\bdeactivated\s*\(\s*\)\s*\{': ('onDeactivated', 'deactivated'),

        # Vue 3 Composition API lifecycle
        r'\bonMounted\s*\(': ('mountedHook', 'onMount'),
        r'\bonUnmounted\s*\(': ('unmountedHook', 'onUnmount'),
        r'\bonBeforeMount\s*\(': ('beforeMountHook', 'preMount'),
        r'\bonBeforeUnmount\s*\(': ('beforeUnmountHook', 'preUnmount'),
        r'\bonUpdated\s*\(': ('updatedHook', 'onUpdate'),
        r'\bonBeforeUpdate\s*\(': ('beforeUpdateHook', 'preUpdate'),

        # Vue event emitting
        r'\$emit\s*\(': ('emitEvent', 'emit'),
        r'emit\s*\(\s*["\']': ('emitEvent', 'triggerEvent'),

        # Vue reactivity functions
        r'\bref\s*\(': ('createRef', 'initRef'),
        r'\breactive\s*\(': ('createReactive', 'initReactive'),
        r'\bcomputed\s*\(': ('createComputed', 'computedProp'),
        r'\bwatch\s*\(': ('setupWatch', 'watchProp'),
        r'\bwatchEffect\s*\(': ('setupWatchEffect', 'effectWatch'),
        r'\bprovide\s*\(': ('provideValue', 'inject'),
        r'\binject\s*\(': ('injectValue', 'consume'),

        # ===================
        # Vuex Function Patterns
        # ===================

        # Vuex mutations
        r'state\.\w+\s*=': ('mutateState', 'updateState'),
        r'commit\s*\(': ('commitMutation', 'mutate'),

        # Vuex actions
        r'dispatch\s*\(': ('dispatchAction', 'triggerAction'),
        r'context\.commit': ('actionHandler', 'action'),
        r'\{\s*commit\s*,\s*dispatch\s*\}': ('actionHandler', 'storeAction'),
        r'\{\s*commit\s*,\s*state\s*\}': ('mutationHandler', 'storeMutation'),

        # Vuex getters
        r'state\s*,\s*getters': ('getterFn', 'computeGetter'),
        r'return\s+state\.': ('getterFn', 'selectState'),

        # ===================
        # Vue Router Function Patterns
        # ===================

        # Router navigation
        r'router\.push\s*\(': ('navigateTo', 'goTo'),
        r'router\.replace\s*\(': ('replaceTo', 'redirect'),
        r'router\.go\s*\(': ('navigateHistory', 'goBack'),
        r'\$router\.push': ('navigateTo', 'goTo'),
        r'\$router\.replace': ('replaceTo', 'redirect'),

        # Navigation guards
        r'beforeEnter\s*:': ('guardRoute', 'beforeEnter'),
        r'beforeRouteEnter': ('beforeRouteEnterGuard', 'enterGuard'),
        r'beforeRouteLeave': ('beforeRouteLeaveGuard', 'leaveGuard'),
        r'beforeRouteUpdate': ('beforeRouteUpdateGuard', 'updateGuard'),
        r'router\.beforeEach': ('globalBeforeGuard', 'routerGuard'),
        r'router\.afterEach': ('globalAfterHook', 'afterHook'),
        r'next\s*\(\s*\)': ('proceedNavigation', 'allowRoute'),
        r'next\s*\(\s*false\s*\)': ('cancelNavigation', 'blockRoute'),
        r'next\s*\(\s*\{': ('redirectNavigation', 'redirectRoute'),
    }

    # Common parameter patterns based on position and usage
    PARAM_PATTERNS = {
        # Callback parameters
        r'\.then\s*\(\s*(\w+)\s*=>': ('result', 'data'),
        r'\.catch\s*\(\s*(\w+)\s*=>': ('error', 'err'),
        r'\.map\s*\(\s*(\w+)\s*=>': ('item', 'element'),
        r'\.map\s*\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)': [('item', 'element'), ('index', 'i')],
        r'\.filter\s*\(\s*(\w+)\s*=>': ('item', 'element'),
        r'\.reduce\s*\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)': [('accumulator', 'acc'), ('current', 'item')],
        r'\.forEach\s*\(\s*(\w+)\s*=>': ('item', 'element'),
        r'\.find\s*\(\s*(\w+)\s*=>': ('item', 'element'),
        r'\.sort\s*\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)': [('a', 'first'), ('b', 'second')],

        # ===================
        # Vue.js Parameter Patterns
        # ===================

        # Vue component lifecycle parameters
        r'watch\s*\(\s*[^,]+,\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)': [('newValue', 'newVal'), ('oldValue', 'oldVal')],
        r'watch\s*\(\s*[^,]+,\s*(\w+)\s*=>': ('newValue', 'newVal'),

        # Vue router navigation guard parameters
        r'beforeEach\s*\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)': [('to', 'toRoute'), ('from', 'fromRoute'), ('next', 'proceed')],
        r'afterEach\s*\(\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)': [('to', 'toRoute'), ('from', 'fromRoute')],
        r'beforeEnter\s*:\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)': [('to', 'toRoute'), ('from', 'fromRoute'), ('next', 'proceed')],
        r'beforeRouteEnter\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)': [('to', 'toRoute'), ('from', 'fromRoute'), ('next', 'proceed')],
        r'beforeRouteLeave\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)': [('to', 'toRoute'), ('from', 'fromRoute'), ('next', 'proceed')],
        r'beforeRouteUpdate\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)': [('to', 'toRoute'), ('from', 'fromRoute'), ('next', 'proceed')],

        # Vuex action context parameter
        r'actions:\s*\{[^}]*\(\s*(\w+)\s*\)': ('context', 'ctx'),
        r'actions:\s*\{[^}]*\(\s*\{\s*commit': None,  # Destructured context

        # Vuex mutation state parameter
        r'mutations:\s*\{[^}]*\(\s*(\w+)\s*,': ('state', 'currentState'),
        r'mutations:\s*\{[^}]*\(\s*(\w+)\s*\)': ('state', 'currentState'),

        # Vuex getter parameters
        r'getters:\s*\{[^}]*\(\s*(\w+)\s*\)': ('state', 'currentState'),
        r'getters:\s*\{[^}]*\(\s*(\w+)\s*,\s*(\w+)\s*\)': [('state', 'currentState'), ('getters', 'otherGetters')],
        r'getters:\s*\{[^}]*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)': [('state', 'currentState'), ('getters', 'otherGetters'), ('rootState', 'globalState')],
        r'getters:\s*\{[^}]*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)': [('state', 'currentState'), ('getters', 'otherGetters'), ('rootState', 'globalState'), ('rootGetters', 'globalGetters')],

        # Vue provide/inject
        r'inject\s*:\s*\[.*?(\w+)': None,  # Inject key name
    }

    # Reserved words that shouldn't be renamed
    RESERVED = {
        'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
        'return', 'function', 'var', 'let', 'const', 'class', 'new', 'this', 'super',
        'import', 'export', 'default', 'from', 'as', 'try', 'catch', 'finally',
        'throw', 'async', 'await', 'yield', 'true', 'false', 'null', 'undefined',
        'typeof', 'instanceof', 'in', 'of', 'delete', 'void', 'debugger', 'with',
        'arguments', 'eval', 'NaN', 'Infinity', 'window', 'document', 'console',
        'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date',
        'RegExp', 'Error', 'Promise', 'Map', 'Set', 'Symbol', 'Proxy', 'Reflect',
        # Vue.js reserved
        'Vue', 'ref', 'reactive', 'computed', 'watch', 'watchEffect', 'toRef', 'toRefs',
        'onMounted', 'onUnmounted', 'onBeforeMount', 'onBeforeUnmount', 'onUpdated',
        'onBeforeUpdate', 'onActivated', 'onDeactivated', 'onErrorCaptured',
        'provide', 'inject', 'defineComponent', 'defineProps', 'defineEmits',
        'defineExpose', 'withDefaults', 'useSlots', 'useAttrs', 'nextTick',
        # Vuex reserved
        'Vuex', 'Store', 'mapState', 'mapGetters', 'mapActions', 'mapMutations',
        'createStore', 'useStore', 'createNamespacedHelpers',
        # Vue Router reserved
        'VueRouter', 'createRouter', 'createWebHistory', 'createWebHashHistory',
        'createMemoryHistory', 'useRouter', 'useRoute', 'RouterView', 'RouterLink',
        'onBeforeRouteLeave', 'onBeforeRouteUpdate',
    }

    def __init__(self):
        self.compiled_api = {
            re.compile(pattern): names
            for pattern, names in self.API_PATTERNS.items()
            if names is not None
        }
        self.compiled_func = {
            re.compile(pattern): names
            for pattern, names in self.FUNCTION_PATTERNS.items()
        }

    def analyze_file(self, file_path: Path) -> NamingResult:
        """Analyze a file and suggest better names"""
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            code = f.read()

        return self.analyze_code(code, file_path)

    def analyze_code(self, code: str, file_path: Path = None) -> NamingResult:
        """Analyze code and suggest better names"""
        suggestions = []

        # Find all single-letter and short variable names
        short_vars = self._find_short_variables(code)

        # For each short variable, try to infer meaning from usage
        for var_name in short_vars:
            suggestion = self._infer_variable_name(var_name, code)
            if suggestion:
                suggestions.append(suggestion)

        # Find poorly named functions
        func_suggestions = self._analyze_functions(code)
        suggestions.extend(func_suggestions)

        # Apply suggestions to code (create renamed version)
        renamed_code = self._apply_suggestions(code, suggestions)

        # Count what was renamed
        var_count = sum(1 for s in suggestions if not s.reason.startswith('Function'))
        func_count = sum(1 for s in suggestions if s.reason.startswith('Function'))

        return NamingResult(
            file_path=file_path or Path('unknown'),
            suggestions=suggestions,
            renamed_code=renamed_code,
            variables_renamed=var_count,
            functions_renamed=func_count
        )

    def _find_short_variables(self, code: str) -> Set[str]:
        """Find all single-letter and short meaningless variable names"""
        short_vars = set()

        # Find variable declarations
        patterns = [
            r'\b(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)',
            r'function\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)',
            r'=>\s*(\w+)\s*(?:=>|,|\))',
            r'\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)',
        ]

        for pattern in patterns:
            for match in re.finditer(pattern, code):
                var_name = match.group(1)
                # Only consider short names (1-2 chars) or hex-like names
                if self._is_poor_name(var_name):
                    short_vars.add(var_name)

        return short_vars - self.RESERVED

    def _is_poor_name(self, name: str) -> bool:
        """Check if a variable name is poor/meaningless"""
        if name in self.RESERVED:
            return False

        # Single letter (except common conventions)
        if len(name) == 1 and name not in ('i', 'j', 'k', 'x', 'y', 'z', 'e'):
            return True

        # Two letters that aren't common abbreviations
        common_short = {'id', 'el', 'fn', 'cb', 'db', 'io', 'fs', 'os', 'ui', 'vm'}
        if len(name) == 2 and name.lower() not in common_short:
            return True

        # Hex-like obfuscated names
        if re.match(r'^_0x[a-f0-9]+$', name):
            return True

        # Random-looking names (e.g., aB3, xYz)
        if len(name) <= 3 and re.match(r'^[a-zA-Z][a-zA-Z0-9]{1,2}$', name):
            # Check if it looks random (mixed case, numbers)
            if (any(c.isupper() for c in name) and any(c.islower() for c in name)) or \
               any(c.isdigit() for c in name):
                return True

        return False

    def _infer_variable_name(self, var_name: str, code: str) -> Optional[NameSuggestion]:
        """Try to infer a better name from usage patterns"""
        best_suggestion = None
        best_confidence = 0.0

        # Escape the variable name for regex
        escaped = re.escape(var_name)

        # Check each API pattern
        for pattern, (primary_name, fallback_name) in self.compiled_api.items():
            # Create pattern with the variable
            try:
                if re.search(pattern.pattern.replace(r'(\w+)', escaped), code):
                    confidence = 0.8
                    if confidence > best_confidence:
                        best_confidence = confidence
                        best_suggestion = NameSuggestion(
                            original=var_name,
                            suggested=primary_name,
                            confidence=confidence,
                            reason=f"Usage pattern: {pattern.pattern[:50]}...",
                            context=self._get_usage_context(var_name, code)
                        )
            except re.error:
                continue

        # Check for specific value assignments that reveal purpose
        assignment_patterns = [
            (rf'{escaped}\s*=\s*document\.', 'element', 0.9),
            (rf'{escaped}\s*=\s*window\.', 'windowProp', 0.7),
            (rf'{escaped}\s*=\s*\[\s*\]', 'array', 0.6),
            (rf'{escaped}\s*=\s*{{\s*}}', 'object', 0.6),
            (rf'{escaped}\s*=\s*["\']', 'string', 0.5),
            (rf'{escaped}\s*=\s*\d+', 'number', 0.5),
            (rf'{escaped}\s*=\s*true|false', 'flag', 0.6),
            (rf'{escaped}\s*=\s*null', 'nullable', 0.5),
            (rf'{escaped}\s*=\s*new\s+Date', 'date', 0.8),
            (rf'{escaped}\s*=\s*new\s+RegExp', 'regex', 0.8),
            (rf'{escaped}\s*=\s*new\s+Map', 'map', 0.8),
            (rf'{escaped}\s*=\s*new\s+Set', 'set', 0.8),
        ]

        for pattern, name, confidence in assignment_patterns:
            if re.search(pattern, code) and confidence > best_confidence:
                best_confidence = confidence
                best_suggestion = NameSuggestion(
                    original=var_name,
                    suggested=name,
                    confidence=confidence,
                    reason=f"Assignment pattern suggests {name}",
                    context=self._get_usage_context(var_name, code)
                )

        # Only return suggestions with decent confidence
        if best_suggestion and best_confidence >= 0.6:
            return best_suggestion

        return None

    def _analyze_functions(self, code: str) -> List[NameSuggestion]:
        """Analyze function bodies to suggest better function names"""
        suggestions = []

        # Find function declarations with poor names
        func_pattern = r'function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{([^}]+)\}'
        arrow_pattern = r'(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{([^}]+)\}'

        for pattern in [func_pattern, arrow_pattern]:
            for match in re.finditer(pattern, code, re.DOTALL):
                func_name = match.group(1)
                func_body = match.group(2)

                if self._is_poor_name(func_name):
                    suggestion = self._infer_function_name(func_name, func_body)
                    if suggestion:
                        suggestions.append(suggestion)

        return suggestions

    def _infer_function_name(self, func_name: str, func_body: str) -> Optional[NameSuggestion]:
        """Infer a better function name from its body"""
        for pattern, (primary_name, fallback_name) in self.compiled_func.items():
            if pattern.search(func_body):
                return NameSuggestion(
                    original=func_name,
                    suggested=primary_name,
                    confidence=0.7,
                    reason=f"Function body pattern: {pattern.pattern[:30]}...",
                    context=func_body[:100]
                )
        return None

    def _get_usage_context(self, var_name: str, code: str, context_chars: int = 50) -> str:
        """Get code context around variable usage"""
        escaped = re.escape(var_name)
        match = re.search(rf'.{{0,{context_chars}}}\b{escaped}\b.{{0,{context_chars}}}', code)
        if match:
            return match.group(0).strip()
        return ""

    def _apply_suggestions(self, code: str, suggestions: List[NameSuggestion]) -> str:
        """Apply naming suggestions to code"""
        # Sort by original name length (longest first) to avoid partial replacements
        sorted_suggestions = sorted(suggestions, key=lambda s: len(s.original), reverse=True)

        renamed = code
        for suggestion in sorted_suggestions:
            if suggestion.confidence >= 0.7:  # Only apply high-confidence suggestions
                # Use word boundary to avoid partial matches
                pattern = rf'\b{re.escape(suggestion.original)}\b'
                renamed = re.sub(pattern, suggestion.suggested, renamed)

        return renamed

    def print_suggestions(self, result: NamingResult, max_show: int = 20):
        """Print naming suggestions"""
        print(f"\n  Naming Analysis: {result.file_path.name if result.file_path else 'code'}")
        print(f"  Variables renamed: {result.variables_renamed}")
        print(f"  Functions renamed: {result.functions_renamed}")

        if result.suggestions:
            print(f"\n  Top suggestions:")
            sorted_suggestions = sorted(result.suggestions, key=lambda s: s.confidence, reverse=True)
            for s in sorted_suggestions[:max_show]:
                conf_pct = int(s.confidence * 100)
                print(f"    {s.original:10} → {s.suggested:15} ({conf_pct}%) - {s.reason[:40]}")

            if len(result.suggestions) > max_show:
                print(f"    ... and {len(result.suggestions) - max_show} more")
