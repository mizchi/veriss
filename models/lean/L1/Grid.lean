/-!
# L1 Grid (docs/adr/0018-coordinate-subset.md)

Columns are `px` lengths or `minmax(0, <n>fr)`; rows are `px`. The free space `F = W − Σ px − (n − 1) gap` (never below 0)
is shared by the fr columns: in proportion to their factors when the factors sum to 1 or more, each taking `fr × F`
otherwise (CSS Grid §12.7.1).
-/
namespace L1

inductive Track where
  | px (size : Rat)
  | fr (factor : Rat)
deriving Repr, Inhabited

def Track.fixed : Track → Rat
  | .px s => s
  | .fr _ => 0

def Track.factor : Track → Rat
  | .px _ => 0
  | .fr f => f

def sumBy (f : α → Rat) : List α → Rat
  | [] => 0
  | x :: xs => f x + sumBy f xs

/-- The free space the fr columns share, never below 0. -/
def freeSpace (W gap : Rat) (cols : List Track) : Rat :=
  max 0 (W - sumBy Track.fixed cols - (cols.length - 1 : Int) * gap)

/-- The size one fr unit takes. -/
def frUnit (W gap : Rat) (cols : List Track) : Rat :=
  let free := freeSpace W gap cols
  let total := sumBy Track.factor cols
  if 1 ≤ total then free / total else free

def Track.size (unit : Rat) : Track → Rat
  | .px s => s
  | .fr f => f * unit

/-- The column sizes at container width `W`. -/
def columns (W gap : Rat) (cols : List Track) : List Rat :=
  cols.map (Track.size (frUnit W gap cols))

/-- The start of each track: the sizes and gaps before it. -/
def starts (gap : Rat) : List Rat → List Rat
  | [] => []
  | sizes => (sizes.foldl (fun (acc : List Rat × Rat) s => (acc.1 ++ [acc.2], acc.2 + s + gap)) ([], 0)).1

end L1

namespace L1

inductive Align where
  | stretch | start | center | «end»
deriving Repr, Inhabited, BEq

structure GridItem where
  column : Nat × Nat   -- lines a / b (1-based, a < b)
  row : Nat × Nat
  width : Option Rat   -- none: auto
  height : Option Rat
  justify : Align := .stretch
  align : Align := .stretch
deriving Repr, Inhabited

structure Grid where
  columns : List Track
  rows : List Rat
  columnGap : Rat := 0
  rowGap : Rat := 0
  items : List GridItem
deriving Repr, Inhabited

/-- A border box, and whether its position is inside L1 (an overflowing center / end alignment is not). -/
structure Box where
  x : Rat
  y : Rat
  w : Rat
  h : Rat
  ok : Bool
deriving Repr, Inhabited, BEq

/-- The start and the size of the area between lines a and b (1-based) of tracks `sizes` with `gap`. -/
def area (gap : Rat) (sizes : List Rat) (a b : Nat) : Rat × Rat :=
  let st := starts gap sizes
  let s := st.getD (a - 1) 0
  (s, st.getD (b - 2) 0 + sizes.getD (b - 2) 0 - s)

/-- Self alignment in an area: the offset and size of an item, and whether it is inside L1. -/
def place (start areaSize : Rat) (size : Option Rat) (how : Align) : Rat × Rat × Bool :=
  match size, how with
  | none, _ => (start, areaSize, true)          -- auto: stretched (auto with another alignment is outside L1)
  | some s, .center => (start + (areaSize - s) / 2, s, decide (s ≤ areaSize))
  | some s, .end => (start + areaSize - s, s, decide (s ≤ areaSize))
  | some s, _ => (start, s, true)

def Grid.layout (g : Grid) (W : Rat) : List Box :=
  let cols := L1.columns W g.columnGap g.columns
  g.items.map fun it =>
    let (ax, aw) := area g.columnGap cols it.column.1 it.column.2
    let (ay, ah) := area g.rowGap g.rows it.row.1 it.row.2
    let (x, w, okx) := place ax aw it.width it.justify
    let (y, h, oky) := place ay ah it.height it.align
    { x, y, w, h, ok := okx && oky }

end L1
