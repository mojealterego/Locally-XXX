(set-logic QF_LIA)
(set-option :produce-models true)
(declare-const ttl Int)
(declare-const ttl_next Int)
; Negacja tezy: TTL musi maleć, jeżeli ttl >= 1 oraz next = ttl - 1.
(assert (>= ttl 1))
(assert (= ttl_next (- ttl 1)))
(assert (not (< ttl_next ttl)))
(check-sat)
; Oczekiwane: unsat. Weryfikacja niezależnym checkerem NIE jest częścią tego przykładu.
(exit)
