/**
 * JavaScript Static Analyzer
 *
 * Extract function definitions, call graph, and side effects.
 * This is where we determine what WILL happen without running it.
 */

const acorn = require('acorn');
const walk = require('acorn-walk');

/**
 * Analyze all JavaScript to extract functions and effects
 */
function analyzeJS(scripts) {
  const functions = [];
  const effects = [];
  const eventBindings = [];
  const apiCalls = [];
  const domMutations = [];

  for (const script of scripts) {
    try {
      const ast = acorn.parse(script.content, {
        ecmaVersion: 2022,
        sourceType: 'module',
        allowHashBang: true,
        locations: true
      });

      extractFromAST(ast, {
        functions,
        effects,
        eventBindings,
        apiCalls,
        domMutations,
        scriptUrl: script.url
      });
    } catch (e) {
      // Try parsing as script (not module) if module parse fails
      try {
        const ast = acorn.parse(script.content, {
          ecmaVersion: 2022,
          sourceType: 'script',
          allowHashBang: true,
          locations: true
        });

        extractFromAST(ast, {
          functions,
          effects,
          eventBindings,
          apiCalls,
          domMutations,
          scriptUrl: script.url
        });
      } catch (e2) {
        // Skip unparseable scripts (minified, syntax errors, etc.)
        // In production, would use a more robust parser like @babel/parser
      }
    }
  }

  // Build call graph
  const callGraph = buildCallGraph(functions);

  return {
    functions,
    effects,
    eventBindings,
    apiCalls,
    domMutations,
    callGraph,
    summary: {
      functions: functions.length,
      effects: effects.length,
      eventBindings: eventBindings.length,
      apiCalls: apiCalls.length,
      domMutations: domMutations.length
    }
  };
}

/**
 * Extract information from AST
 */
function extractFromAST(ast, context) {
  walk.ancestor(ast, {
    // Function declarations
    FunctionDeclaration(node, ancestors) {
      context.functions.push(extractFunction(node, ancestors, context.scriptUrl));
    },

    // Function expressions (including arrow functions)
    FunctionExpression(node, ancestors) {
      context.functions.push(extractFunction(node, ancestors, context.scriptUrl));
    },

    ArrowFunctionExpression(node, ancestors) {
      context.functions.push(extractFunction(node, ancestors, context.scriptUrl));
    },

    // Method definitions
    MethodDefinition(node, ancestors) {
      context.functions.push({
        type: 'method',
        name: node.key?.name || node.key?.value || 'anonymous',
        loc: node.loc,
        scriptUrl: context.scriptUrl,
        isAsync: node.value?.async,
        isGenerator: node.value?.generator,
        params: node.value?.params?.map(p => getParamName(p)) || []
      });
    },

    // Call expressions - look for event bindings and effects
    CallExpression(node, ancestors) {
      const call = extractCallInfo(node, ancestors);

      // Event bindings
      if (call.isEventBinding) {
        context.eventBindings.push(call);
      }

      // API/network calls
      if (call.isNetworkCall) {
        context.apiCalls.push(call);
      }

      // DOM mutations
      if (call.isDOMMutation) {
        context.domMutations.push(call);
      }

      // General effects
      if (call.isEffect) {
        context.effects.push(call);
      }
    },

    // Member expression assignments (style changes, classList, etc.)
    AssignmentExpression(node, ancestors) {
      const assignment = extractAssignmentInfo(node, ancestors);
      if (assignment.isEffect) {
        context.effects.push(assignment);
      }
      if (assignment.isDOMMutation) {
        context.domMutations.push(assignment);
      }
    }
  });
}

/**
 * Extract function information
 */
function extractFunction(node, ancestors, scriptUrl) {
  const name = node.id?.name ||
               getAssignedName(ancestors) ||
               'anonymous';

  // Analyze function body for effects
  const bodyEffects = [];
  if (node.body) {
    walk.simple(node.body, {
      CallExpression(innerNode) {
        const effect = identifyEffect(innerNode);
        if (effect) bodyEffects.push(effect);
      },
      AssignmentExpression(innerNode) {
        const effect = identifyAssignmentEffect(innerNode);
        if (effect) bodyEffects.push(effect);
      }
    });
  }

  return {
    type: node.type,
    name,
    loc: node.loc,
    scriptUrl,
    isAsync: node.async,
    isGenerator: node.generator,
    params: node.params?.map(p => getParamName(p)) || [],
    effects: bodyEffects,
    calls: extractFunctionCalls(node.body)
  };
}

/**
 * Get parameter name handling different patterns
 */
function getParamName(param) {
  if (param.type === 'Identifier') return param.name;
  if (param.type === 'RestElement') return '...' + getParamName(param.argument);
  if (param.type === 'AssignmentPattern') return getParamName(param.left) + '?';
  if (param.type === 'ObjectPattern') return '{...}';
  if (param.type === 'ArrayPattern') return '[...]';
  return 'unknown';
}

/**
 * Get name from assignment context
 */
function getAssignedName(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = ancestors[i];
    if (node.type === 'VariableDeclarator' && node.id?.name) {
      return node.id.name;
    }
    if (node.type === 'AssignmentExpression' && node.left?.name) {
      return node.left.name;
    }
    if (node.type === 'Property' && node.key?.name) {
      return node.key.name;
    }
  }
  return null;
}

/**
 * Extract call information
 */
function extractCallInfo(node, ancestors) {
  const callee = getCalleeName(node.callee);
  const args = node.arguments?.map(a => getArgSummary(a)) || [];

  // Event binding patterns
  const eventBindingPatterns = ['addEventListener', 'on', 'bind', 'one', 'live', 'delegate'];
  const isEventBinding = eventBindingPatterns.some(p => callee.endsWith(p)) ||
                         /\.on[A-Z]/.test(callee);

  // Network call patterns
  const networkPatterns = ['fetch', 'axios', 'request', 'get', 'post', 'put', 'delete', 'patch', 'XMLHttpRequest', 'ajax', '\$.ajax', '\$.get', '\$.post'];
  const isNetworkCall = networkPatterns.some(p => callee.includes(p));

  // DOM mutation patterns
  const domMutationPatterns = [
    'appendChild', 'removeChild', 'insertBefore', 'replaceChild',
    'createElement', 'createTextNode', 'cloneNode',
    'setAttribute', 'removeAttribute', 'toggleAttribute',
    'insertAdjacentHTML', 'insertAdjacentElement',
    'innerHTML', 'outerHTML', 'textContent', 'innerText',
    'classList.add', 'classList.remove', 'classList.toggle', 'classList.replace',
    'remove', 'replaceWith', 'append', 'prepend', 'after', 'before'
  ];
  const isDOMMutation = domMutationPatterns.some(p => callee.includes(p));

  // Style mutation patterns
  const styleMutationPatterns = ['style.', 'setProperty', 'cssText'];
  const isStyleMutation = styleMutationPatterns.some(p => callee.includes(p));

  // General effects
  const effectPatterns = [
    'setTimeout', 'setInterval', 'requestAnimationFrame',
    'location.href', 'location.assign', 'location.replace',
    'history.pushState', 'history.replaceState', 'history.back', 'history.forward',
    'localStorage.setItem', 'sessionStorage.setItem',
    'console.', 'alert', 'confirm', 'prompt',
    'scrollTo', 'scrollBy', 'scrollIntoView',
    'focus', 'blur', 'click', 'submit', 'reset',
    'play', 'pause', 'load'
  ];
  const isEffect = effectPatterns.some(p => callee.includes(p)) ||
                   isDOMMutation || isStyleMutation || isNetworkCall;

  return {
    callee,
    args,
    loc: node.loc,
    isEventBinding,
    isNetworkCall,
    isDOMMutation,
    isStyleMutation,
    isEffect,
    // Extract event type if this is an event binding
    eventType: isEventBinding ? extractEventType(args, callee) : null,
    // Extract handler reference if this is an event binding
    handler: isEventBinding ? extractHandlerRef(args, callee) : null
  };
}

/**
 * Get callee name from various patterns
 */
function getCalleeName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  if (callee.type === 'MemberExpression') {
    const obj = getCalleeName(callee.object);
    const prop = callee.property?.name || callee.property?.value || '[]';
    return `${obj}.${prop}`;
  }
  if (callee.type === 'CallExpression') {
    return getCalleeName(callee.callee) + '()';
  }
  return 'unknown';
}

/**
 * Get argument summary
 */
function getArgSummary(arg) {
  if (arg.type === 'Literal') return { type: 'literal', value: arg.value };
  if (arg.type === 'Identifier') return { type: 'identifier', name: arg.name };
  if (arg.type === 'FunctionExpression' || arg.type === 'ArrowFunctionExpression') {
    return { type: 'function', isAsync: arg.async };
  }
  if (arg.type === 'ObjectExpression') return { type: 'object' };
  if (arg.type === 'ArrayExpression') return { type: 'array' };
  return { type: arg.type };
}

/**
 * Extract event type from arguments
 */
function extractEventType(args, callee) {
  // addEventListener('click', handler)
  if (args.length > 0 && args[0].type === 'literal' && typeof args[0].value === 'string') {
    return args[0].value;
  }
  // .onClick, .onSubmit, etc.
  const onMatch = callee.match(/\.on([A-Z][a-z]+)$/);
  if (onMatch) {
    return onMatch[1].toLowerCase();
  }
  return null;
}

/**
 * Extract handler reference from arguments
 */
function extractHandlerRef(args, callee) {
  // addEventListener('event', handler)
  if (args.length > 1) {
    if (args[1].type === 'identifier') return args[1].name;
    if (args[1].type === 'function') return 'inline';
  }
  return null;
}

/**
 * Extract assignment info for style/attribute changes
 */
function extractAssignmentInfo(node, ancestors) {
  const left = getAssignmentTarget(node.left);

  const isStyleAssignment = left.includes('.style.') || left.includes('.cssText');
  const isClassAssignment = left.includes('.className') || left.includes('.classList');
  const isDOMMutation = left.includes('.innerHTML') || left.includes('.outerHTML') ||
                        left.includes('.textContent') || left.includes('.innerText');
  const isAttributeAssignment = left.includes('.setAttribute') || left.match(/\.\w+$/);

  return {
    target: left,
    loc: node.loc,
    isStyleAssignment,
    isClassAssignment,
    isDOMMutation,
    isAttributeAssignment,
    isEffect: isStyleAssignment || isClassAssignment || isDOMMutation
  };
}

/**
 * Get assignment target as string
 */
function getAssignmentTarget(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') {
    const obj = getAssignmentTarget(node.object);
    const prop = node.property?.name || node.property?.value || '[]';
    return `${obj}.${prop}`;
  }
  return 'unknown';
}

/**
 * Identify effect from call node
 */
function identifyEffect(node) {
  const callee = getCalleeName(node.callee);

  const effectTypes = {
    'fetch': 'network',
    'axios': 'network',
    '\$.ajax': 'network',
    'appendChild': 'dom-add',
    'removeChild': 'dom-remove',
    'createElement': 'dom-create',
    'setAttribute': 'dom-attr',
    'classList': 'class-change',
    'style.': 'style-change',
    'scrollTo': 'scroll',
    'focus': 'focus',
    'blur': 'focus',
    'setTimeout': 'timer',
    'setInterval': 'timer',
    'localStorage': 'storage',
    'sessionStorage': 'storage',
    'history.': 'navigation',
    'location.': 'navigation'
  };

  for (const [pattern, type] of Object.entries(effectTypes)) {
    if (callee.includes(pattern)) {
      return { type, callee };
    }
  }

  return null;
}

/**
 * Identify effect from assignment
 */
function identifyAssignmentEffect(node) {
  const target = getAssignmentTarget(node.left);

  if (target.includes('.style.')) return { type: 'style-change', property: target };
  if (target.includes('.className')) return { type: 'class-change', property: target };
  if (target.includes('.innerHTML')) return { type: 'dom-html', property: target };
  if (target.includes('.textContent')) return { type: 'dom-text', property: target };

  return null;
}

/**
 * Extract function calls from function body
 */
function extractFunctionCalls(body) {
  if (!body) return [];

  const calls = [];
  walk.simple(body, {
    CallExpression(node) {
      const callee = getCalleeName(node.callee);
      if (!callee.includes('.') || callee.split('.')[0] !== callee.split('.')[0].toLowerCase()) {
        // Likely a user-defined function call
        calls.push(callee);
      }
    }
  });

  return [...new Set(calls)];
}

/**
 * Build call graph from functions
 */
function buildCallGraph(functions) {
  const graph = new Map();

  for (const fn of functions) {
    if (fn.name && fn.name !== 'anonymous') {
      graph.set(fn.name, {
        calls: fn.calls || [],
        effects: fn.effects || [],
        calledBy: []
      });
    }
  }

  // Build reverse mapping (calledBy)
  for (const [name, info] of graph) {
    for (const callee of info.calls) {
      if (graph.has(callee)) {
        graph.get(callee).calledBy.push(name);
      }
    }
  }

  return Object.fromEntries(graph);
}

module.exports = { analyzeJS, buildCallGraph };
