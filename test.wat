;; -*- mode: scheme -*-

  ;;;;; Test Core Language

  ;; DEF

  (provide ()
    (def (x y) (list #t #f))
    (assert (eq? x #t))
    (assert (eq? y #f))
    
    (assert (eq? (def #ign #t) #t)))

  ;; IF

  (provide ()
    (assert (eq? #t (if #t #t #f)))
    (assert (eq? #f (if #f #t #f))))

  ;; VAU

  (provide ()
    (def env (current-environment))
    (eq? #t ((vau x #ign x) #t))
    (eq? #t ((vau (x . #ign) #ign x) (list #t)))
    (eq? env ((vau #ign e e))))

  ;; EVAL

  (provide ()
    (def env (current-environment))
    (eval (list def (quote x) #t) env)
    (assert (eq? x #t))
    
    (assert (eq? (eval #t env) #t)))

  ;; WRAP

  (provide ()
    (assert (eq? #t ((wrap (vau (x) #ign x)) (not #f)))))

  ;; UNWRAP

  (provide ()
    (assert (eq? list (unwrap (wrap list)))))

  ;; EQ?

  (provide ()
    (assert (eq? #t #t))
    (assert (not (eq? #t #f)))
    (assert (not (eq? (list 1) (list 1)))))

  ;; CONS

  (provide ()
    (assert (eq? #t (car (cons #t #f))))
    (assert (eq? #f (cdr (cons #t #f)))))

  ;; MAKE-ENVIRONMENT

  (provide ()
    (def e1 (make-environment))
    (eval (list def (quote x) #t) e1)
    (eval (list def (quote y) #t) e1)
    (assert (eq? #t (eval (quote x) e1)))
    (assert (eq? #t (eval (quote y) e1)))

    (def e2 (make-environment e1))
    (assert (eq? #t (eval (quote x) e2)))
    (assert (eq? #t (eval (quote y) e2)))
    (eval (list def (quote y) #f) e2)
    (assert (eq? #f (eval (quote y) e2)))
    (assert (eq? #t (eval (quote y) e1))))

  ;; MAKE-TYPE
 
  (provide ()
    (def type (make-type))
    (assert (eq? (type-of type) (type-of (type-of #t)))))

  ;; TYPE-ENVIRONMENT

  (provide ()
    (def type (make-type))
    (def tenv (type-environment type))
    (assert (eq? (type-of tenv) (type-of (current-environment)))))

  ;; TYPE-OF

  (provide ()
    (assert (not (eq? (type-of () #void))))
    (assert (eq? (type-of 0) (type-of 1))))

  ;; TAG, UNTAG

  (provide ()
    (def type (make-type))
    (def tagged (tag type #t))
    (assert (eq? (type-of tagged) type))
    (assert (eq? (untag tagged) #t)))

  ;; VECTOR, VECTOR-REF

  (provide ()
    (def (a b c) (list 1 2 3))
    (def v (vector a b c))
    (assert (eq? (vector-ref v 0) a))
    (assert (eq? (vector-ref v 1) b))
    (assert (eq? (vector-ref v 2) c)))

  ;; Quotation

  (provide ()
    (assert (symbol? 'x))
    (assert (pair? '(a . b))))

  ;;;;; Test Crust Language

  ;; NULL?

  (provide ()
    (assert (null? ()))
    (assert (not (null? 12))))

  ;; BEGIN

  (provide ()
    (assert (eq? #void (begin)))
    (assert (eq? #t (begin (eq? #t #t))))
    (assert (eq? #t (begin #f (eq? #t #t)))))

  ;; Continuation Marks

  (provide ()
    (eq? () (current-marks 'foo))
    (eq? #t (with-mark 'foo #t (car (current-marks 'foo))))
    (eq? #f (with-mark 'foo #t (with-mark 'foo #f (car (current-marks 'foo)))))
    (eq? () (with-mark 'foo #t (with-mark 'foo #f (cdr (current-marks 'foo)))))
    (define (id x) x)
    (eq? #f (with-mark 'foo #t (id (with-mark 'foo #f (car (current-marks 'foo))))))
    (eq? #t (with-mark 'foo #t (id (with-mark 'foo #f (car (cdr (current-marks 'foo)))))))
    (eq? () (with-mark 'foo #t (id (with-mark 'foo #f (cdr (cdr (current-marks 'foo)))))))
    (eq? () (current-marks 'foo)))

  ;; Delimited Control

  
  ;; (let ((p (make-prompt)))
  ;; 		  (+ 2 (push-prompt p
  ;; 				    (if (take-sub-cont p
  ;; 						       (lambda (k)
  ;; 							 (+ (push-sub-cont k #f)
  ;; 							    (push-sub-cont k #t))))
  ;; 					3
  ;; 					4))))

(define-syntax test-check
  (vau (#ign expr res) env
    (assert (= (display (eval expr env)) (eval res env)))))

(define new-prompt make-prompt)

(test-check 'test2
  (let ((p (new-prompt)))
    (+ (push-prompt p (push-prompt p 5))
       4))
  9)

(test-check 'test3
  (let ((p (new-prompt)))
    (+ (push-prompt p (+ (take-sub-cont p (lambda #ign 5)) 6))
       4))
  9)

(test-check 'test3-1
  (let ((p (new-prompt)))
    (+ (push-prompt p (push-prompt p (+ (take-sub-cont p (lambda #ign 5)) 6)))
       4))
  9)

(test-check 'test3-2
  (let ((p (new-prompt)))
    (let ((v (push-prompt p
	       (let* ((v1 (push-prompt p (+ (take-sub-cont p (lambda #ign 5)) 6)))
		      (v1 (take-sub-cont p (lambda #ign 7))))
		 (+ v1 10)))))
      (+ v 20)))
  27)

(test-check 'test4
  (let ((p (make-prompt)))
    (+ (push-prompt* p
         (lambda ()
	   (+ (take-sub-cont p (lambda (sk) (push-sub-cont* sk (lambda () 5))))
	      7)))
       20))
  32)

(test-check 'test6
  (let ((p1 (new-prompt))
	(p2 (new-prompt))
	(push-twice (lambda (sk)
		      (push-sub-cont* sk (lambda () (push-sub-cont* sk (lambda () 3)))))))
    (+ 10
      (push-prompt* p1 (lambda () (+ 1
             			(push-prompt* p2 (lambda () (take-sub-cont p1 (lambda (sk) (push-twice sk))))))))))
  15)

(test-check 'test7
  (let* ((p1 (new-prompt))
	 (p2 (new-prompt))
	 (p3 (new-prompt))
	 (push-twice
	    (lambda (sk)
	      (push-sub-cont* sk (lambda () (push-sub-cont* sk (lambda ()
		(take-sub-cont p2 (lambda (sk2)
		  (push-sub-cont* sk2 (lambda ()
		    (push-sub-cont* sk2 (lambda () 3)))))))))))))
    (+ 100
      (push-prompt* p1 (lambda ()
	(+ 1
	  (push-prompt* p2 (lambda ()
	    (+ 10
	      (push-prompt* p3  (lambda () (take-sub-cont p1 (lambda (sk) (push-twice sk)))))))))))))
  135)

