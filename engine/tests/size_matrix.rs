//! Cross-size integration matrix: every variant at n=6 and n=9.
//!
//! 16×16 is intentionally excluded — the current pure-backtracking solver can't
//! generate/grade it per-request (deferred pending solver constraint propagation;
//! see docs/superpowers/specs/2026-05-31-board-size-generalization-design.md).
//!
//! Two solver characteristics shape what we assert:
//!   1. The generator guarantees a **uniquely solvable** puzzle, but only the
//!      killer generator carves to *grader*-solvability. For classic/xsudoku/
//!      jigsaw an arbitrarily deep carve (min_clues=0) can produce a unique
//!      puzzle that exceeds the human-technique grader. So grader-`Solved` is
//!      asserted at a realistic clue floor (~40% of cells), not at min_clues=0.
//!   2. `solve_variant` (pure backtracking) prunes killer cages on uniqueness
//!      but NOT on cage *sums* (sums are only checked at complete grids). So a
//!      near-minimal killer is pathologically slow to verify via `solve_variant`.
//!      We therefore assert backtracking-uniqueness only for the variants where
//!      it's efficient (classic/xsudoku/jigsaw); killer's uniqueness is covered
//!      transitively by the grader test below — a grade of `Solved` means the
//!      puzzle is solvable by forced moves, which cannot branch, hence unique.

use stillgrid_engine::{
    generate_for_n, grade_variant, solve_variant, GradeOutcome, Rng, SolveOutcome, VariantKind,
};

const KINDS: [VariantKind; 4] =
    [VariantKind::Classic, VariantKind::XSudoku, VariantKind::Jigsaw, VariantKind::Killer];

#[test]
fn classic_x_jigsaw_generate_unique_6_and_9() {
    let mut rng = Rng::new(99);
    for &n in &[6usize, 9] {
        // Killer excluded: solve_variant lacks cage-sum pruning, so a minimal
        // killer is pathologically slow here (its uniqueness is covered by the
        // grader test). See module doc.
        for kind in [VariantKind::Classic, VariantKind::XSudoku, VariantKind::Jigsaw] {
            let p = generate_for_n(&mut rng, n, kind, 0);
            let b = p.givens;
            assert_eq!(b.n(), n, "n={n} kind={kind:?} wrong board size");
            assert!(
                matches!(solve_variant(&b, &p.variant), SolveOutcome::Unique(_)),
                "n={n} kind={kind:?} not uniquely solvable at min_clues=0"
            );
        }
    }
}

#[test]
fn all_variants_grade_solved_at_realistic_clues() {
    let mut rng = Rng::new(7);
    for &n in &[6usize, 9] {
        // ~40% of cells given — a normal-difficulty floor where the human-style
        // grader is expected to solve every variant. A grade of `Solved` also
        // proves the puzzle is unique (forced moves cannot branch).
        let floor = (n * n) * 2 / 5;
        for kind in KINDS {
            let p = generate_for_n(&mut rng, n, kind, floor);
            let b = p.givens;
            assert_eq!(b.n(), n, "n={n} kind={kind:?} wrong board size");
            assert!(
                matches!(grade_variant(&b, &p.variant), GradeOutcome::Solved { .. }),
                "n={n} kind={kind:?} (floor={floor}, clue_count={}) graded Stuck",
                p.clue_count
            );
        }
    }
}
