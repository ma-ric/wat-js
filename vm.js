// Wat VM by Manuel Simoni (msimoni@gmail.com)
module.exports = function WatVM(user_boot_bytecode, parser) {
    /* Continuations */
    function Continuation(fun, next, dbg, e) {
        this.fun = fun; this.next = next; this.dbg = dbg; this.e = e; }
    function isContinuation(x) { return x instanceof Continuation; }
    function Capture(prompt, handler) {
        this.prompt = prompt; this.handler = handler; this.k = null; }
    function isCapture(x) { return x instanceof Capture; }
    function captureFrame(capture, fun, dbg, e) {
        capture.k = new Continuation(fun, capture.k, dbg, e); }
    function continueFrame(k, f) {
        return k.fun(k.next, f); }
    /* Evaluation Core */
    function evaluate(e, k, f, x) {
        if (x && x.wat_eval) return x.wat_eval(e, k, f); else return x; }
    function Sym(name) { this.name = name; }
    function sym(name) { return new Sym(name); }
    Sym.prototype.wat_eval = function(e, k, f) { return lookup(e, this.name); };
    function Cons(car, cdr) { this.car = car; this.cdr = cdr; }
    Cons.prototype.wat_eval = function(e, k, f) {
        if (isContinuation(k)) {
            var op = continueFrame(k, f);
        } else {
            var op = evaluate(e, null, null, car(this));
        }
        if (isCapture(op)) {
            var that = this;
            captureFrame(op, function(k, f) { return that.wat_eval(e, k, f); }, this, e);
            return op;
        }
        return combine(e, null, null, op, cdr(this));
    };
    /* Operative & Applicative Combiners */
    function combine(e, k, f, cmb, o) {
        if (cmb && cmb.wat_combine) return cmb.wat_combine(e, k, f, o);
        else if (cmb instanceof Function) return jswrap(cmb).wat_combine(e, k, f, o);
        else return error("not a combiner: " + to_string(cmb)); }
    function Opv(p, ep, x, e) { this.p = p; this.ep = ep; this.x = x; this.e = e; }
    function Apv(cmb) { this.cmb = cmb; }
    function wrap(cmb) { return new Apv(cmb); };
    function unwrap(apv) { return apv instanceof Apv ? apv.cmb : error("cannot unwrap: " + apv); }
    Opv.prototype.wat_combine = function(e, k, f, o) {
        var xe = make_env(this.e); 
        var pCap = bind(xe, this.p, o);
        if (isCapture(pCap)) return pCap;
        var epCap = bind(xe, this.ep, e);
        if (isCapture(epCap)) return epCap;
        return evaluate(xe, k, f, this.x);
    };
    Apv.prototype.wat_combine = function(e, k, f, o) {
        if (isContinuation(k)) {
            var args = continueFrame(k, f);
        } else {
            var args = evalArgs(e, null, null, o, NIL);
        }
        if (isCapture(args)) {
            var that = this;
            captureFrame(args, function(k, f) { return that.wat_combine(e, k, f, o); }, cons(this, o), e);
            return args;
        }
        return this.cmb.wat_combine(e, null, null, args);
    };
    function evalArgs(e, k, f, todo, done) {
        if (todo === NIL) { return reverse_list(done); }
        if (isContinuation(k)) {
            var arg = continueFrame(k, f);
        } else {
            var arg = evaluate(e, null, null, car(todo));
        }
        if (isCapture(arg)) {
            captureFrame(arg, function(k, f) { return evalArgs(e, k, f, todo, done); }, car(todo), e);
            return arg;
        }
        return evalArgs(e, null, null, cdr(todo), cons(arg, done));
    }
    /* Built-in Combiners */
    function Vau() {}; function Def() {}; function Eval() {};
    Vau.prototype.wat_combine = function(e, k, f, o) {
        return new Opv(elt(o, 0), elt(o, 1), elt(o, 2), e); };
    Def.prototype.wat_combine = function self(e, k, f, o) {
        var lhs = elt(o, 0); if (isCapture(lhs)) return lhs;
        var rhs = elt(o, 1); if (isCapture(rhs)) return rhs;
        if (isContinuation(k)) {
            var val = continueFrame(k, f);
        } else {
            var val = evaluate(e, null, null, rhs);
        }
        if (isCapture(val)) {
            captureFrame(val, function(k, f) { return self(e, k, f, o); }, rhs, e);
            return val;
        }
        return bind(e, lhs, val);
    }
    Eval.prototype.wat_combine = function(e, k, f, o) {
        var x = elt(o, 0); if (isCapture(x)) return x;
        var e = elt(o, 1); if (isCapture(e)) return e;
        return evaluate(e, k, f, x); };
    /* First-order Control */
    function Begin() {}; function If() {}; function Loop() {}
    function Catch() {}; function Finally() {}
    Begin.prototype.wat_combine = function(e, k, f, o) {
        if (o === NIL) return null; else return begin(e, k, f, o); };
    function begin(e, k, f, xs) {
        if (isContinuation(k)) {
            var res = continueFrame(k, f);
        } else {
            var res = evaluate(e, null, null, car(xs));
        }
        if (isCapture(res)) {
            captureFrame(res, function(k, f) { return begin(e, k, f, xs); }, car(xs), e);
            return res;
        }
        var kdr = cdr(xs);
        if (kdr === NIL) return res; else return begin(e, null, null, kdr);
    }
    If.prototype.wat_combine = function self(e, k, f, o) {
        if (isContinuation(k)) {
            var test = continueFrame(k, f);
        } else {
            var test = evaluate(e, null, null, elt(o, 0));
        }
        if (isCapture(test)) {
            captureFrame(test, function(k, f) { return self(e, k, f, o); }, elt(o, 0), e);
            return test;
        }
        return evaluate(e, null, null, test ? elt(o, 1) : elt(o, 2));
    };
    Loop.prototype.wat_combine = function self(e, k, f, o) {
        var first = true; // only continue once
        while (true) {
            if (first && isContinuation(k)) {
                var res = continueFrame(k, f);
            } else {
                var res = evaluate(e, null, null, elt(o, 0));
            }
            first = false;
            if (isCapture(res)) {
                captureFrame(res, function(k, f) { return self(e, k, f, o); }, elt(o, 0), e);
                return res;
            }
        }
    };
    Catch.prototype.wat_combine = function self(e, k, f, o) {
        var x = elt(o, 0);
        var handler = elt(o, 1);
        try {
            if (isContinuation(k)) {
                var res = continueFrame(k, f);
            } else {
                var res = evaluate(e, null, null, x);
            }
        } catch(exc) {
            // unwrap handler to prevent eval if exc is sym or cons
            var res = combine(e, null, null, unwrap(handler), list(exc));
        }
        if (isCapture(res)) {
            captureFrame(res, function(k, f) { return self(e, k, f, o); }, x, e);
            return res;
        } else {
            return res;
        }
    };
    Finally.prototype.wat_combine = function self(e, k, f, o) {
        var prot = elt(o, 0);
        var cleanup = elt(o, 1);
        try {
            if (isContinuation(k)) {
                var res = continueFrame(k, f);
            } else {
                var res = evaluate(e, null, null, prot);
            }
            if (isCapture(res)) {
                captureFrame(res, function(k, f) { return self(e, k, f, o); }, prot, e);
            }
        } finally {
            if (isCapture(res)) {
                return res;
            } else {
                return doCleanup(e, null, null, cleanup, res);
            }
        }
    };
    function doCleanup(e, k, f, cleanup, res) {
        if (isContinuation(k)) {
            var fres = continueFrame(k, f);
        } else {
            var fres = evaluate(e, null, null, cleanup);
        }
        if (isCapture(fres)) {
            captureFrame(fres, function(k, f) { return doCleanup(e, k, f, cleanup, res); }, cleanup, e);
            return fres;
        } else {
            return res;
        }
    }
    /* Delimited Control */
    function PushPrompt() {}; function TakeSubcont() {}; function PushSubcont() {}; function PushPromptSubcont() {}
    PushPrompt.prototype.wat_combine = function self(e, k, f, o) {
        var prompt = elt(o, 0);
        var x = elt(o, 1);
        if (isContinuation(k)) {
            var res = continueFrame(k, f);
        } else {
            var res = evaluate(e, null, null, x);
        }
        if (isCapture(res)) {
            if (res.prompt === prompt) {
                var continuation = res.k;
                var handler = res.handler;
                return combine(e, null, null, handler, cons(continuation, NIL));
            } else {
                captureFrame(res, function(k, f) { return self(e, k, f, o); }, x, e);
                return res;
            }
        } else {
            return res;
        }
    };
    TakeSubcont.prototype.wat_combine = function(e, k, f, o) {
        var prompt = elt(o, 0);
        var handler = elt(o, 1);
        var cap = new Capture(prompt, handler);
        captureFrame(cap, function(k, thef) { return combine(e, null, null, thef, NIL); }, this, e);
        return cap;
    };
    PushSubcont.prototype.wat_combine = function self(e, k, f, o) {
        var thek = elt(o, 0);
        var thef = elt(o, 1);
        if (isContinuation(k)) {
            var res = continueFrame(k, f);
        } else {
            var res = continueFrame(thek, thef);
        }
        if (isCapture(res)) {
            captureFrame(res, function(k, f) { return self(e, k, f, o); }, thef, e);
            return res;
        } else {
            return res;
        }
    };
    PushPromptSubcont.prototype.wat_combine = function self(e, k, f, o) {
        var prompt = elt(o, 0);
        var thek = elt(o, 1);
        var thef = elt(o, 2);
        if (isContinuation(k)) {
            var res = continueFrame(k, f);
        } else {
            var res = continueFrame(thek, thef);
        }
        if (isCapture(res)) {
            if (res.prompt === prompt) {
                var continuation = res.k;
                var handler = res.handler;
                return combine(e, null, null, handler, cons(continuation, NIL));
            } else {
                captureFrame(res, function(k, f) { return self(e, k, f, o); }, thef, e);
                return res;
            }
        } else {
            return res;
        }
    };
    /* Dynamic Variables */
    function DV(val) { this.val = val; }
    function DNew() {}; function DRef() {}; function DLet() {}
    DNew.prototype.wat_combine = function(e, k, f, o) { return new DV(elt(o, 0)); };
    DRef.prototype.wat_combine = function(e, k, f, o) { return elt(o, 0).val; };
    DLet.prototype.wat_combine = function self(e, k, f, o) {
        var dv = elt(o, 0);
        var val = elt(o, 1);
        var x = elt(o, 2);
        var oldVal = dv.val;
        dv.val = val;
        try {
            if (isContinuation(k)) {
                var res = continueFrame(k, f);
            } else {
                var res = evaluate(e, null, null, x);
            }
            if (isCapture(res)) {
                captureFrame(res, function(k, f) { return self(e, k, f, o); }, x, e);
                return res;
            } else {
                return res;
            }
        } finally {
            dv.val = oldVal;
        }
    };
    /* Objects */
    function Nil() {}; var NIL = new Nil();
    function Ign() {}; var IGN = new Ign();
    function cons(car, cdr) { return new Cons(car, cdr); }
    function car(cons) {
        if (cons instanceof Cons) return cons.car; else return error("not a cons: " + to_string(cons)); }
    function cdr(cons) {
        if (cons instanceof Cons) return cons.cdr; else return error("not a cons: " + to_string(cons)); }
    function elt(cons, i) { return (i === 0) ? car(cons) : elt(cdr(cons), i - 1); }
    function sym_name(sym) { return sym.name; }
    function Env(parent) { this.bindings = Object.create(parent ? parent.bindings : null); this.parent = parent; }
    function make_env(parent) { return new Env(parent); }
    function lookup(e, name) {
        if (name in e.bindings) return e.bindings[name];
        else return error("unbound: " + name); }
    function bind(e, lhs, rhs) { 
        if (lhs.wat_match) return lhs.wat_match(e, rhs); else return error("cannot match against: " + lhs); }
    Sym.prototype.wat_match = function(e, rhs) {
        return e.bindings[this.name] = rhs; }
    Cons.prototype.wat_match = function(e, rhs) {
        var carCap = car(this).wat_match(e, car(rhs));
        if (isCapture(carCap)) return carCap;
        var cdrCap = cdr(this).wat_match(e, cdr(rhs));
        if (isCapture(cdrCap)) return cdrCap; };
    Nil.prototype.wat_match = function(e, rhs) {
        if (rhs !== NIL) return error("NIL expected, but got: " + to_string(rhs)); };
    Ign.prototype.wat_match = function(e, rhs) {};
    /* Setter - you are not expected to understand this - immediately */
    var SETTER = jswrap(function setter(obj) { return obj.wat_setter; });
    SETTER.wat_setter = jswrap(function(new_setter, obj) { obj.wat_setter = new_setter; });
    /* Error handling */
    var ROOT_PROMPT = {};
    function push_root_prompt(x) { return list(new PushPrompt(), ROOT_PROMPT, x); }
    function error(err) {
        var print_stacktrace = environment.bindings["user-break"];
        if (print_stacktrace !== undefined) {
            return combine(environment, null, null, print_stacktrace, list(err));
        } else { throw err; } }
    /* Utilities */
    function list() {
        return array_to_list(Array.prototype.slice.call(arguments)); }
    function list_star() {
        var len = arguments.length; var c = len >= 1 ? arguments[len-1] : NIL;
        for (var i = len-1; i > 0; i--) c = cons(arguments[i - 1], c); return c; }
    function array_to_list(array, end) {
        var c = end ? end : NIL;
        for (var i = array.length; i > 0; i--) c = cons(array[i - 1], c); return c; }
    function list_to_array(c) {
        var res = []; while(c !== NIL) { res.push(car(c)); c = cdr(c); } return res; }
    function reverse_list(list) {
        var res = NIL; while(list !== NIL) { res = cons(car(list), res); list = cdr(list); } return res; }
    var js_types = ["Array", "Boolean", "Date", "Function", "Number", "Object", "RegExp", "String"];
    function is_type(obj, type_obj, type_name) {
        if (!type_obj) return error("type is undefined");
        if (js_types.indexOf(type_name) === -1) { return obj instanceof type_obj; }
        else { return toString.call(obj) === "[object " + type_name + "]"; } }
    /* Bytecode parser */
    function parse_bytecode(obj) {
        switch(Object.prototype.toString.call(obj)) {
        case "[object String]": return obj === "#ignore" ? IGN : sym(obj);
        case "[object Array]": return parse_bytecode_array(obj);
        default: return obj; } }
    function parse_bytecode_array(arr) {
        if ((arr.length == 2) && arr[0] === "wat-string") { return arr[1]; }
        var i = arr.indexOf(".");
        if (i === -1) return array_to_list(arr.map(parse_bytecode));
        else { var front = arr.slice(0, i);
               return array_to_list(front.map(parse_bytecode), parse_bytecode(arr[i + 1])); } }
    /* JSNI */
    function JSFun(jsfun) {
        if (Object.prototype.toString.call(jsfun) !== "[object Function]") return error("no fun");
        this.jsfun = jsfun; }
    JSFun.prototype.wat_combine = function(e, k, f, o) {
        return this.jsfun.apply(null, list_to_array(o)); };
    function jswrap(jsfun) { return wrap(new JSFun(jsfun)); }
    function js_unop(op) { return jswrap(new Function("a", "return (" + op + " a)")); }
    function js_binop(op) { return jswrap(new Function("a", "b", "return (a " + op + " b)")); }
    function js_invoker(method_name) {
        return jswrap(function() {
            if (arguments.length < 1) return error("invoker called with wrong args: " + arguments);
            if (!method_name) return error("method name is null/undefined");
            var rcv = arguments[0];
            if (!rcv) return error("receiver is null/undefined");
            var method = rcv[method_name];
            if (!method) return error("method not found: " + method_name + " in: " + to_string(rcv));
            return method.apply(rcv, Array.prototype.slice.call(arguments, 1)); }); }
    function js_getter(prop_name) {
        var getter = jswrap(function() {
            if (arguments.length !== 1) return error(prop_name + " getter called with wrong args");
            var rcv = arguments[0];
            if ((rcv !== undefined) && (rcv !== null)) return rcv[prop_name];
            else return error("can't get " + prop_name + " of " + rcv); });
        getter.wat_setter = js_setter(prop_name); return getter; }
    function js_setter(prop_name) {
        return jswrap(function() {
            if (arguments.length !== 2) return error("setter called with wrong args: " + arguments);
            var rcv = arguments[1];
            if ((rcv !== undefined) && (rcv !== null)) return rcv[prop_name] = arguments[0];
            else return error("can't set " + prop_name + " of " + rcv); }); }
    function make_prototype(name) {
        var prop_names = Array.prototype.slice.call(arguments, 1);
        var param_names = prop_names.join(",");
        var param_inits = prop_names.map(function(prop_name) {
            return "this." + prop_name + "=" + prop_name + ";"; }).join("");
        return eval("(function " + name + "(" + param_names + "){" + param_inits + "})"); }
    function jsnew(ctor) {
        var factoryFunction = ctor.bind.apply(ctor, arguments);
        return new factoryFunction(); }
    function js_function(cmb) {
        return function() {
            var args = cons(this, array_to_list(Array.prototype.slice.call(arguments)));
            return combine(null, null, null, cmb, args); } }
    var JS_GLOBAL = jswrap(function(name) { return eval(name); });
    JS_GLOBAL.wat_setter = jswrap(function(new_val, name) { global[name] = new_val; });
    /* Stringification */
    function to_string(obj) {
        if (toString.call(obj) === "[object String]") return JSON.stringify(obj);
        else if ((obj !== null) && (obj !== undefined)) return obj.toString();
        else return Object.prototype.toString.call(obj); }
    Nil.prototype.toString = function() { return "()"; };
    Ign.prototype.toString = function() { return "#ignore"; };
    Sym.prototype.toString = function() { return this.name; };
    Cons.prototype.toString = function() { return "(" + cons_to_string(this) + ")" };
    function cons_to_string(c) {
        if (cdr(c) === NIL) return to_string(car(c));
        else if (cdr(c) instanceof Cons) { return to_string(car(c)) + " " + cons_to_string(cdr(c)); }
        else return to_string(car(c)) + " . " + to_string(cdr(c)); }
    Apv.prototype.toString = function() { return "[Apv " + to_string(this.cmb) + "]"; };
    Opv.prototype.toString = function() {
        return "[Opv " + to_string(this.p) + " " + to_string(this.ep) + " " + to_string(this.x) + "]"; };
    Vau.prototype.toString = function() { return "vm-vau"; };
    Def.prototype.toString = function() { return "vm-def"; };
    Eval.prototype.toString = function() { return "vm-eval"; };
    Begin.prototype.toString = function() { return "vm-begin"; };
    If.prototype.toString = function() { return "vm-if"; };
    Loop.prototype.toString = function() { return "vm-loop"; };
    Catch.prototype.toString = function() { return "vm-catch"; };
    Finally.prototype.toString = function() { return "vm-finally"; };
    DLet.prototype.toString = function() { return "vm-dlet"; }
    DNew.prototype.toString = function() { return "vm-dnew"; }
    DRef.prototype.toString = function() { return "vm-dref"; }
    PushPrompt.prototype.toString = function() { return "vm-push-prompt"; }
    TakeSubcont.prototype.toString = function() { return "vm-take-subcont"; }
    PushSubcont.prototype.toString = function() { return "vm-push-subcont"; }
    PushPromptSubcont.prototype.toString = function() { return "vm-push-prompt-subcont"; }
    JSFun.prototype.toString = function() { return "[JSFun " + this.jsfun.toString() + "]"; };
    /* Bootstrap */
    var boot_bytecode =
        ["vm-begin",
         // Basics
         ["vm-def", "vm-vau", new Vau()],
         ["vm-def", "vm-eval", wrap(new Eval())],
         ["vm-def", "vm-make-environment", jswrap(function(env) { return make_env(env); })],
         ["vm-def", "vm-wrap", jswrap(wrap)],
         ["vm-def", "vm-unwrap", jswrap(unwrap)],
         // Values
         ["vm-def", "vm-cons", jswrap(cons)],
         ["vm-def", "vm-cons?", jswrap(function(obj) { return obj instanceof Cons; })],
         ["vm-def", "vm-nil?", jswrap(function(obj) { return obj === NIL; })],
         ["vm-def", "vm-string-to-symbol", jswrap(sym)],
         ["vm-def", "vm-symbol?", jswrap(function(obj) { return obj instanceof Sym; })],
         ["vm-def", "vm-symbol-name", jswrap(sym_name)],
         // First-order Control
         ["vm-def", "vm-if", new If()],
         ["vm-def", "vm-loop", new Loop()],
         ["vm-def", "vm-throw", jswrap(function(err) { throw err; })],
         ["vm-def", "vm-catch", new Catch()],
         ["vm-def", "vm-finally", new Finally()],
         // Delimited Control
         ["vm-def", "vm-push-prompt", new PushPrompt()],
         ["vm-def", "vm-take-subcont", wrap(new TakeSubcont())],
         ["vm-def", "vm-push-subcont", wrap(new PushSubcont())],
         ["vm-def", "vm-push-prompt-subcont", wrap(new PushPromptSubcont())],
         // Dynamically-scoped Variables
         ["vm-def", "vm-dnew", wrap(new DNew())],
         ["vm-def", "vm-dlet", new DLet()],
         ["vm-def", "vm-dref", wrap(new DRef())],
         // Setters
         ["vm-def", "vm-setter", SETTER],
         // Errors
         ["vm-def", "vm-root-prompt", ROOT_PROMPT],
         ["vm-def", "vm-error", jswrap(error)],
         // JS Interface
         ["vm-def", "vm-js-wrap", jswrap(jswrap)],
         ["vm-def", "vm-js-unop", jswrap(js_unop)],
         ["vm-def", "vm-js-binop", jswrap(js_binop)],
         ["vm-def", "vm-js-getter", jswrap(js_getter)],
         ["vm-def", "vm-js-setter", jswrap(js_setter)],
         ["vm-def", "vm-js-invoker", jswrap(js_invoker)],
         ["vm-def", "vm-js-function", jswrap(js_function)],
         ["vm-def", "vm-js-global", JS_GLOBAL],
         ["vm-def", "vm-js-make-object", jswrap(function() { return {}; })],
         ["vm-def", "vm-js-make-prototype", jswrap(make_prototype)],
         ["vm-def", "vm-js-new", jswrap(jsnew)],
         ["vm-def", "vm-type?", jswrap(is_type)],
         // Utilities
         ["vm-def", "vm-list-to-array", jswrap(list_to_array)],
         ["vm-def", "vm-array-to-list", jswrap(array_to_list)],
         ["vm-def", "vm-reverse-list", jswrap(reverse_list)],
         ["vm-def", "vm-list*", jswrap(list_star)],
         // User-supplied boot code; defines user environment
         ["vm-begin"].concat(user_boot_bytecode)
        ];
    var environment = make_env();
    bind(environment, sym("vm-def"), new Def());
    bind(environment, sym("vm-begin"), new Begin());
    var ms = new Date().getTime();
    var user_environment = evaluate(environment, null, null, parse_bytecode(boot_bytecode));
    if (!(user_environment instanceof Env)) throw "failed to boot Wat";
    console.log("Wat VM startup time: " + (new Date().getTime() - ms) + "ms");
    /* API */
    this.eval = function(sexp){
        if (!parser) throw "parsing not supported"; return this.exec(parser.parse_sexp(sexp)); }
    this.exec = function(bytecode) {
        var wrapped = push_root_prompt(parse_bytecode([new Begin()].concat(bytecode)));
        var res = evaluate(user_environment, null, null, wrapped);
        if (isCapture(res)) throw "prompt not found: " + res.prompt;
        return res; }
    this.call = function(fun_name) {
        return this.exec(parse_bytecode([fun_name].concat(Array.prototype.slice.call(arguments, 1)))); }
    this.get = function(var_name) { return this.exec(parse_bytecode(var_name)); }
}
