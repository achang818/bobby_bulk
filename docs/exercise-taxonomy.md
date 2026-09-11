# Exercise taxonomy

Every exercise has separate metadata for its broader movement and its anatomy.

- `movementPattern` describes the broad structural movement category used to
  preserve exercise intent, such as horizontal push, vertical pull, knee
  dominant, hip hinge, carry, or trunk flexion.
- `primaryAction` describes the specific primary anatomical or joint action,
  such as elbow flexion, shoulder horizontal adduction, knee extension, hip
  extension, or spinal flexion.
- `primaryMuscles` are the direct targets used for direct volume and frequency.
  `secondaryMuscles` are supporting involvement and never substitute for a
  direct target in muscle-priority logic.
- `type` is the compound/isolation distinction used by plan-structure logic.
  `category` is a catalog and UI grouping, not a biomechanical classification.

`spinal-flexion` means flexion of the vertebral column. It must not be used as
a loose synonym for bending the torso forward: a sit-up is stored as the
broader `trunk-flexion` pattern with a primary `hip-flexion` action because it
substantially involves the hip flexors. A cable crunch or crunch machine uses
the focused `spinal-flexion` action.

## Intentional use of `isolation`

`isolation` is a deliberate movement-pattern fallback for an exercise with no
useful broader structural role to preserve. Curls, lateral raises, leg
extensions, and focused crunches are examples. It does not mean those exercises
are mechanically interchangeable: their primary action, direct muscles, type,
and equipment still describe distinct roles.

## Similarity and current substitution

The catalog records direct primary-muscle overlap, movement pattern, primary
action, compound/isolation type, equipment, and each exercise's specific role.
No single field establishes exercise equivalence. The current implementation
does not turn those fields into a general similarity score.

Today, the stalled-exercise replacement path requires the same catalog category
and direct primary-muscle overlap; for isolation exercises it prefers an exact
primary-muscle match. It does not treat matching `primaryAction` as sufficient.
The equipment-context substitution path also scores a matching
`movementPattern` after preserving category and a direct primary target. These
are intentionally narrow, deterministic rules rather than a general similarity
engine.
