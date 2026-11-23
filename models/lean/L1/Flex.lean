import L1.Grid
/-!
# L1 Flex (row, nowrap): CSS Flexbox §9.7 "Resolving Flexible Lengths", as the algorithm

This is the freezing loop the specification gives, step by step, not the closed form of the Z3 reference
(models/layout/spec.mjs), so the two are independent definitions of the same sizes. Only min-width clamps (no max).
-/
namespace L1

structure FlexItem where
  basis : Rat
  grow : Rat := 0
  shrink : Rat := 1
  min : Rat := 0
  height : Option Rat := none
  align : Option Align := none
deriving Repr, Inhabited

inductive Justify where
  | flexStart | flexEnd | center | spaceBetween | spaceAround | spaceEvenly
deriving Repr, Inhabited, BEq

structure Flex where
  height : Rat
  gap : Rat := 0
  justify : Justify := .flexStart
  alignItems : Align := .stretch
  items : List FlexItem
deriving Repr, Inhabited

/-- One item during the loop: its target size and whether it is frozen. -/
structure Slot where
  item : FlexItem
  target : Rat
  frozen : Bool
deriving Repr, Inhabited

def hypothetical (it : FlexItem) : Rat := max it.basis it.min

def absR (x : Rat) : Rat := if x < 0 then -x else x

/-- §9.7 4.c: an unfrozen item's target from the remaining free space (by grow factor, or by scaled shrink factor). -/
def distribute (growing : Bool) (remaining factorSum scaledSum : Rat) (s : Slot) : Slot :=
  if s.frozen then s
  else if growing then { s with target := s.item.basis + (if factorSum = 0 then 0 else remaining * s.item.grow / factorSum) }
  else { s with target := s.item.basis - (if scaledSum = 0 then 0 else absR remaining * (s.item.shrink * s.item.basis) / scaledSum) }

/-- §9.7 4.d–e: clamp an unfrozen target at min, and freeze it (every item when the total violation is 0, else the
clamped ones). -/
def clampFreeze (violation : Rat) (s : Slot) : Slot :=
  if s.frozen then s
  else if violation = 0 then { s with target := max s.target s.item.min, frozen := true }
  else if max s.target s.item.min ≠ s.target then { s with target := max s.target s.item.min, frozen := true }
  else s

theorem distribute_item (g : Bool) (r f c : Rat) (s : Slot) : (distribute g r f c s).item = s.item := by
  unfold distribute; split <;> (try split) <;> rfl
theorem clampFreeze_item (v : Rat) (s : Slot) : (clampFreeze v s).item = s.item := by
  unfold clampFreeze; split <;> (try split) <;> (try split) <;> rfl

/-- §9.7 step 4, repeated: distribute the remaining free space among the unfrozen items, clamp and freeze. `fuel`
bounds the rounds (each round freezes at least one item, so the length plus one is enough). -/
def resolveLoop (growing : Bool) (inner initialFree : Rat) : Nat → List Slot → List Slot
  | 0, slots => slots
  | fuel + 1, slots =>
    if slots.all (·.frozen) then slots else
    let unfrozen := slots.filter (!·.frozen)
    let frozenSum := sumBy (·.target) (slots.filter (·.frozen))
    let remaining0 := inner - frozenSum - sumBy (·.item.basis) unfrozen
    let factorSum := sumBy (fun s => if growing then s.item.grow else s.item.shrink) unfrozen
    -- §9.7 4.b: with factors summing below 1, at most that share of the initial free space.
    let remaining := if factorSum < 1 then
        (let share := initialFree * factorSum; if absR share < absR remaining0 then share else remaining0)
      else remaining0
    let scaledSum := sumBy (fun u => u.item.shrink * u.item.basis) unfrozen
    let distributed := slots.map (distribute growing remaining factorSum scaledSum)
    let violation := sumBy (fun s => if s.frozen then 0 else max s.target s.item.min - s.target) distributed
    resolveLoop growing inner initialFree fuel (distributed.map (clampFreeze violation))

/-- The main sizes of the items in a container of inner main size `inner`. -/
def resolve (inner : Rat) (items : List FlexItem) : List Rat :=
  let growing := sumBy hypothetical items < inner
  -- Step 3: size inflexible items (factor 0, or a base the hypothetical size moves away from) at their hypothetical size.
  let slots := items.map fun it =>
    let factor := if growing then it.grow else it.shrink
    let inflexible := factor = 0 || (growing && it.basis > hypothetical it) || (!growing && it.basis < hypothetical it)
    { item := it, target := if inflexible then hypothetical it else it.basis, frozen := inflexible : Slot }
  let initialFree := inner - sumBy (fun s => if s.frozen then s.target else s.item.basis) slots
  (resolveLoop growing inner initialFree (items.length + 1) slots).map fun s => max s.target s.item.min

def Flex.layout (f : Flex) (W : Rat) : List Box :=
  let n := f.items.length
  let inner := W - ((n : Rat) - 1) * f.gap
  let sizes := resolve inner f.items
  let L := inner - sumBy id sizes
  let (lead, between, okMain) : Rat × Rat × Bool :=
    if L < 0 then (0, 0, f.justify == .flexStart || f.justify == .spaceBetween) else
    match f.justify with
    | .flexStart => (0, 0, true)
    | .flexEnd => (L, 0, true)
    | .center => (L / 2, 0, true)
    | .spaceBetween => (0, if n > 1 then L / ((n : Rat) - 1) else 0, true)
    | .spaceAround => (L / (2 * n), L / n, true)
    | .spaceEvenly => (L / (n + 1), L / (n + 1), true)
  let xs := (sizes.foldl (fun (acc : List Rat × Rat) s => (acc.1 ++ [acc.2], acc.2 + s + f.gap + between)) ([], lead)).1
  (f.items.zip (xs.zip sizes)).map fun (it, x, w) =>
    let how := it.align.getD f.alignItems
    let h := it.height.getD f.height
    let y := match how with | .center => (f.height - h) / 2 | .end => f.height - h | _ => 0
    { x, y, w, h, ok := okMain && (how == .stretch || how == .start || decide (h ≤ f.height)) }

end L1
