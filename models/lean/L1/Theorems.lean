import L1.Grid
import L1.Flex
/-! Properties of the L1 definitions, proved (no `sorry`). -/
namespace L1

theorem freeSpace_nonneg (W gap : Rat) (cols : List Track) : 0 ≤ freeSpace W gap cols := by
  unfold freeSpace; grind

theorem frUnit_nonneg (W gap : Rat) (cols : List Track) : 0 ≤ frUnit W gap cols := by
  have h := freeSpace_nonneg W gap cols
  simp only [frUnit]
  split
  · next total =>
    have hb0 : (0 : Rat) < sumBy Track.factor cols := by grind
    rw [Rat.div_def]
    exact Rat.mul_nonneg h (by have := Rat.inv_pos.mpr hb0; grind)
  · exact h

/-- The sizes sum to the fixed sizes plus one unit per fr factor. -/
theorem sum_sizes (u : Rat) (cols : List Track) :
    sumBy id (cols.map (Track.size u)) = sumBy Track.fixed cols + u * sumBy Track.factor cols := by
  induction cols with
  | nil => simp only [sumBy, List.map]; grind
  | cons t ts ih =>
    cases t <;> simp only [sumBy, List.map, Track.size, Track.fixed, Track.factor, id, ih] <;> grind

/-- With room for the fixed tracks and factors summing to 1 or more, the tracks and gaps fill the width exactly. -/
theorem columns_fill (W gap : Rat) (cols : List Track)
    (room : 0 ≤ W - sumBy Track.fixed cols - (cols.length - 1 : Int) * gap) (factors : 1 ≤ sumBy Track.factor cols) :
    sumBy id (columns W gap cols) + (cols.length - 1 : Int) * gap = W := by
  unfold columns
  rw [sum_sizes]
  have hpos : sumBy Track.factor cols ≠ 0 := by grind
  have hfree : freeSpace W gap cols = W - sumBy Track.fixed cols - (cols.length - 1 : Int) * gap := by
    unfold freeSpace; grind
  have hunit : frUnit W gap cols = freeSpace W gap cols / sumBy Track.factor cols := by
    simp only [frUnit]; rw [if_pos factors]
  rw [hunit, hfree, Rat.div_mul_cancel hpos]
  grind

/-- The freezing loop keeps each item where it was (it only changes targets and frozen flags). -/
theorem resolveLoop_items (growing : Bool) (inner free : Rat) (fuel : Nat) (slots : List Slot) :
    (resolveLoop growing inner free fuel slots).map (·.item) = slots.map (·.item) := by
  induction fuel generalizing slots with
  | zero => simp only [resolveLoop]
  | succ n ih =>
    simp only [resolveLoop]
    split
    · rfl
    · rw [ih]; simp only [List.map_map, Function.comp_def, clampFreeze_item, distribute_item]

/-- The items as `resolve` starts them: the loop's slots carry the items in order. -/
theorem resolve_slots_items (inner : Rat) (items : List FlexItem) (growing : Bool) (f : FlexItem → Slot) (hf : ∀ it, (f it).item = it) (free : Rat) (fuel : Nat) :
    (resolveLoop growing inner free fuel (items.map f)).map (·.item) = items := by
  rw [resolveLoop_items]; simp only [List.map_map, Function.comp_def, hf, List.map_id']

/-- No item ends below its min-width: every size is its slot's target clamped at that item's min. -/
theorem resolve_ge_min (inner : Rat) (items : List FlexItem) :
    ∀ p ∈ (resolve inner items).zip items, p.2.min ≤ p.1 := by
  unfold resolve
  simp only
  generalize hs : resolveLoop _ _ _ _ _ = slots
  have hitems : slots.map (·.item) = items := by
    rw [← hs]; exact resolve_slots_items inner items _ _ (fun _ => rfl) _ _
  subst hitems
  intro p hp
  rw [List.zip_map', List.mem_map] at hp
  obtain ⟨s, _, rfl⟩ := hp
  grind

end L1
