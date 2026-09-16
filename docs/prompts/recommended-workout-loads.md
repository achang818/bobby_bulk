# Recommended Workout load targets

Add load recommendations to Recommended Workout using the existing progression
engine after exercise selection and set allocation. Respect real equipment loads
and explicit weight units. Show a target and a short explanation in the preview,
then preserve that exact recommendation through logging, resume, and session review.
Actual logged loads remain editable and separate from the original target.

Represent insufficient or incompatible history as an unknown starting load,
never a fabricated zero. Do not increase at the equipment ceiling or propose an
unavailable weight. Keep generated sessions temporary and leave saved plans under
user control. Preserve existing progression and effort rules.

Verify progression, incomplete prescriptions, equipment limits, mixed units,
unknown history, and session persistence. Run tests, build, lint, and a browser
check at desktop and mobile sizes. Acceptance example: qualifying 65 lb working
sets with 70 lb available produce a 70 lb preview and logger target that survives
reload and remains visible in the completed session review.

Compatibility: newly defined equipment lists carry an explicit unit. Untagged
legacy gym lists retain the original pound convention; session history without
a unit continues to follow the selected display unit. Bodyweight and assistance
history does not establish an external load target. Do not derive externally
logged weights from effective body mass.
