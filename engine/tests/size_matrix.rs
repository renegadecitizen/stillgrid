use stillgrid_engine::{
    generate_for_n, grade_variant, solve_variant, GradeOutcome, SolveOutcome, VariantKind, Rng,
};

#[test]
fn all_variants_solve_grade_6_and_9() {
    let mut rng = Rng::new(99);
    for &n in &[6usize, 9] {
        for kind in [
            VariantKind::Classic,
            VariantKind::XSudoku,
            VariantKind::Jigsaw,
            VariantKind::Killer,
        ] {
            let p = generate_for_n(&mut rng, n, kind, 0);
            let b = p.givens; // Board is Copy
            let v = p.variant.clone();
            assert_eq!(b.n(), n, "n={n} kind={kind:?} wrong board size");
            assert!(
                matches!(solve_variant(&b, &v), SolveOutcome::Unique(_)),
                "n={n} kind={kind:?} not uniquely solvable"
            );
            assert!(
                matches!(grade_variant(&b, &v), GradeOutcome::Solved { .. }),
                "n={n} kind={kind:?} not solved by the human-style grader"
            );
        }
    }
}
