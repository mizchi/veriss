import L1
import Lean.Data.Json
/-! The L1 oracle: reads `[{"config": …, "W": …}, …]` (the configurations of models/layout/spec.mjs) on stdin and prints,
for each, the border boxes `[{"x": "n/d", "y": …, "w": …, "h": …, "ok": bool}]` (exact rationals), or
`{"outside": reason}` for a configuration outside L1. -/
open Lean L1

def rat (n : JsonNumber) : Rat := (n.mantissa : Rat) / ((10 ^ n.exponent : Nat) : Rat)
def ratStr (r : Rat) : String := s!"{r.num}/{r.den}"

def num (j : Json) (key : String) (default : Rat := 0) : Except String Rat :=
  match j.getObjVal? key with
  | .ok (.num n) => pure (rat n)
  | .ok .null => pure default
  | .ok (.str "auto") => throw s!"{key} auto"
  | .ok _ => throw s!"{key} is not a number"
  | .error _ => pure default
def optLen (j : Json) (key : String) : Except String (Option Rat) :=
  match j.getObjVal? key with
  | .ok (.num n) => pure (some (rat n))
  | .ok (.str "auto") | .ok .null | .error _ => pure none
  | .ok _ => throw s!"{key} is not a length"
def str (j : Json) (key default : String) : String := (j.getObjValAs? String key).toOption.getD default
def arr (j : Json) (key : String) : Except String (Array Json) := j.getObjValAs? (Array Json) key

def align : String → Except String Align
  | "stretch" => pure .stretch | "start" | "flex-start" => pure .start | "center" => pure .center
  | "end" | "flex-end" => pure .end | other => throw s!"align {other}"
def justify : String → Except String Justify
  | "flex-start" | "start" | "normal" => pure .flexStart | "flex-end" | "end" => pure .flexEnd | "center" => pure .center
  | "space-between" => pure .spaceBetween | "space-around" => pure .spaceAround | "space-evenly" => pure .spaceEvenly
  | other => throw s!"justify-content {other}"
def lines (j : Json) (key : String) : Except String (Nat × Nat) := do
  let a ← j.getObjValAs? (Array Nat) key
  if h : a.size = 2 then pure (a[0], a[1]) else throw s!"{key} is not [a, b]"

def grid (c : Json) : Except String Grid := do
  let columns ← (← arr c "columns").toList.mapM fun t =>
    match t.getObjVal? "px", t.getObjVal? "fr" with
    | .ok (.num n), _ => pure (Track.px (rat n)) | _, .ok (.num n) => pure (Track.fr (rat n)) | _, _ => throw "a column"
  let rows ← (← arr c "rows").toList.mapM fun t => num t "px"
  let items ← (← arr c "items").toList.mapM fun it => do
    pure { column := ← lines it "column", row := ← lines it "row", width := ← optLen it "width", height := ← optLen it "height",
           justify := ← align (str it "justify" "stretch"), align := ← align (str it "align" "stretch") : GridItem }
  pure { columns, rows, columnGap := ← num c "columnGap", rowGap := ← num c "rowGap", items }

def flex (c : Json) : Except String Flex := do
  let items ← (← arr c "items").toList.mapM fun it => do
    if (it.getObjVal? "text").isOk then throw "a text item (its width is an interval: the Z3 reference handles it)"
    pure { basis := ← num it "basis", grow := ← num it "grow", shrink := ← num it "shrink" 1, min := ← num it "min",
           height := ← optLen it "height", align := ← (match it.getObjValAs? String "align" with | .ok a => some <$> align a | .error _ => pure none) : FlexItem }
  pure { height := ← num c "height", gap := ← num c "gap", justify := ← justify (str c "justify" "flex-start"),
         alignItems := ← align (str c "alignItems" "stretch"), items }

def run (case : Json) : Json :=
  let result : Except String (List Box) := do
    let c ← case.getObjVal? "config"
    let W ← match case.getObjVal? "W" with | .ok (.num n) => pure (rat n) | _ => throw "W"
    if str c "display" "flex" == "grid" then pure ((← grid c).layout W) else pure ((← flex c).layout W)
  match result with
  | .ok boxes => Json.arr (boxes.toArray.map fun b => Json.mkObj [("x", ratStr b.x), ("y", ratStr b.y), ("w", ratStr b.w), ("h", ratStr b.h), ("ok", b.ok)])
  | .error e => Json.mkObj [("outside", e)]

def main : IO Unit := do
  let input ← (← IO.getStdin).readToEnd
  match Json.parse input with
  | .error e => IO.eprintln s!"invalid JSON: {e}"; IO.Process.exit 1
  | .ok j =>
    let cases := (j.getArr?).toOption.getD #[]
    IO.println (Json.arr (cases.map run)).compress
