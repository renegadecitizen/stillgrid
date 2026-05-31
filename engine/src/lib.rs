//! Stillgrid engine: sudoku solver, generator, difficulty rater, variants.

pub mod board;
pub mod generator;
pub mod rng;
pub mod solver;
pub mod techniques;
pub mod variant;

pub use board::Board;
pub use generator::{
    generate, generate_for, generate_for_n, generate_killer, generate_killer_n, generate_variant,
    random_jigsaw_variant, random_jigsaw_variant_n, Puzzle,
};
pub use rng::Rng;
pub use solver::{solve, solve_variant, SolveOutcome};
pub use techniques::{grade, grade_variant, GradeOutcome, Step, Technique, Tier};
pub use variant::{Cage, Variant, VariantKind};
