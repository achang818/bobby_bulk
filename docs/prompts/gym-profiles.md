# Editable gym profiles and enforceable equipment constraints

Add an accessible interface to create and edit gym profiles using broad equipment
categories, and optionally list available absolute weights with explicit lb/kg
units. Persist profiles and the selected gym. Keep temporary equipment outages
separate from owned equipment and clear them when switching gyms.

Use one equipment-eligibility rule in Recommended Workout, user-plan suggestions,
and contextual substitutions. Respect equipment alternatives and obvious bench
requirements. Bodyweight work needs no purchased equipment. Unknown equipment
must not be assumed present in a restricted gym. If no suitable substitution
exists, explain the session-only omission without rewriting the saved plan.

Use the selected gym's load lists for the equipment variant actually available.
Do not transfer a demonstrated barbell/machine load to another equipment variant
without usable evidence. Snapshot gym/context at session start; changing profiles
or selecting a different gym must not reinterpret a running session's exercises,
sets, unit, or load guidance. Preserve legacy records and validate user-entered
weights. Existing pound-based lists without units remain pounds.

Acceptance: a dumbbell-only Home profile generates no cable/barbell/machine or
bench-dependent exercises. Its configured weights constrain load targets; a
temporary outage removes only today's access. Profile edits and new profiles
survive reload, while an existing session remains identical. Test generation,
substitutions, missing replacements, alternative equipment, units, validation,
storage, and active-session snapshots. Run tests/build/lint and browser checks at
desktop/mobile widths. Update the relevant master-spec implementation guidance.
