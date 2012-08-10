;; -*- mode: scheme -*-

(define env (current-environment))

(define *top-level* (make-prompt))

(define (repl)
  (define (loop)
    (display (eval (read) env))
    (loop))
  (push-prompt *top-level*
    (loop)))

(display "Welcome to Wat -10.3")
(repl)
