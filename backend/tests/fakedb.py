"""In-memory stand-in for the Supabase client: the slice of the PostgREST query builder Wapsi uses.

Rows live in plain dicts. Unknown columns raise, so a typo fails a test instead of the demo.
`risk_queue` is a view in Postgres; here tests seed it like a table.
"""

import copy
import itertools
import re
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import uuid4

Row = dict[str, Any]

COLUMNS: dict[str, set[str]] = {
    "merchants": {"id", "name", "owner_name", "area", "language", "phone", "cohort", "scripted", "created_at"},
    "devices": {"id", "merchant_id", "model", "status", "fault", "rent_status", "monthly_rent",
                "last_announced_at", "at_risk_since", "updated_at"},
    "daily_volume": {"device_id", "day", "txn_count", "amount"},
    "settlements": {"id", "merchant_id", "settled_on", "amount"},
    "tickets": {"id", "merchant_id", "type", "status", "created_at"},
    "calls": {"id", "merchant_id", "device_id", "phone", "bolna_execution_id", "status", "started_at", "ended_at",
              "duration_s", "cost_cents", "transcript", "summary", "outcome", "raw"},
    "actions": {"id", "call_id", "merchant_id", "device_id", "type", "detail", "payload", "actor", "created_at"},
    "handoffs": {"id", "call_id", "merchant_id", "reason", "summary", "next_step", "status", "created_at"},
    "volume_series": {"device_id", "days", "txns"},
    "risk_queue": {"device_id", "merchant_id", "name", "owner_name", "area", "language", "cohort", "scripted",
                   "status", "fault", "rent_status", "days_silent", "qr_drop_pct", "open_ticket", "risk_score",
                   "reason"},
}

_ISO_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ISO_TS = re.compile(r"^\d{4}-\d{2}-\d{2}T")


def now_iso(delta: timedelta = timedelta(0)) -> str:
    return (datetime.now(UTC) + delta).isoformat()


def _key(value: Any) -> Any:
    """Compare ISO dates and timestamps as dates and datetimes, like Postgres would."""
    if isinstance(value, str) and _ISO_TS.match(value):
        return datetime.fromisoformat(value)
    if isinstance(value, str) and _ISO_DAY.match(value):
        return date.fromisoformat(value)
    return value


class Result:
    def __init__(self, data: list[Row]) -> None:
        self.data = data


class Query:
    def __init__(self, db: "FakeDb", table: str) -> None:
        if table not in COLUMNS:
            raise KeyError(f"unknown table {table}")
        self.db, self.table = db, table
        self.op, self.payload, self.on_conflict = "select", None, ""
        self.filters: list[Callable[[Row], bool]] = []
        self.orders: list[tuple[str, bool]] = []
        self.limit_n: int | None = None
        self._negate = False

    # operations
    def select(self, columns: str = "*") -> "Query":
        for column in columns.replace(" ", "").split(","):
            if column != "*":
                self._check([column])
        self.op = "select"
        return self

    def insert(self, rows: Row | list[Row]) -> "Query":
        self.op, self.payload = "insert", rows
        return self

    def update(self, values: Row) -> "Query":
        self._check(values)
        self.op, self.payload = "update", values
        return self

    def upsert(self, rows: Row | list[Row], on_conflict: str = "") -> "Query":
        self.op, self.payload, self.on_conflict = "upsert", rows, on_conflict
        return self

    # filters
    @property
    def not_(self) -> "Query":
        self._negate = True
        return self

    def _filter(self, column: str, test: Callable[[Any], bool]) -> "Query":
        self._check([column])
        negate, self._negate = self._negate, False
        self.filters.append(lambda row: test(_key(row.get(column))) != negate)
        return self

    def eq(self, column: str, value: Any) -> "Query":
        return self._filter(column, lambda v: v == _key(value))

    def neq(self, column: str, value: Any) -> "Query":
        return self._filter(column, lambda v: v != _key(value))

    def in_(self, column: str, values: list[Any]) -> "Query":
        wanted = [_key(v) for v in values]
        return self._filter(column, lambda v: v in wanted)

    def gte(self, column: str, value: Any) -> "Query":
        return self._filter(column, lambda v: v is not None and v >= _key(value))

    def lte(self, column: str, value: Any) -> "Query":
        return self._filter(column, lambda v: v is not None and v <= _key(value))

    def is_(self, column: str, value: str) -> "Query":
        assert value == "null"
        return self._filter(column, lambda v: v is None)

    def order(self, column: str, *, desc: bool = False) -> "Query":
        self._check([column])
        self.orders.append((column, desc))
        return self

    def limit(self, n: int) -> "Query":
        self.limit_n = n
        return self

    # execution
    def execute(self) -> Result:
        rows = self.db.tables[self.table]
        if self.op == "insert":
            return Result([self._insert(row) for row in self._rows()])
        if self.op == "upsert":
            return Result([self._upsert(row) for row in self._rows()])
        matched = [row for row in rows if all(f(row) for f in self.filters)]
        if self.op == "update":
            for row in matched:
                row.update(copy.deepcopy(self.payload))
            return Result(copy.deepcopy(matched))
        for column, desc in reversed(self.orders):
            matched.sort(key=lambda row: (row.get(column) is None, _key(row.get(column))), reverse=desc)
        if self.limit_n is not None:
            matched = matched[: self.limit_n]
        return Result(copy.deepcopy(matched))

    def _rows(self) -> list[Row]:
        rows = self.payload if isinstance(self.payload, list) else [self.payload]
        for row in rows:
            self._check(row)
        return rows

    def _insert(self, row: Row) -> Row:
        full = {**self.db.defaults(self.table), **copy.deepcopy(row)}
        self.db.tables[self.table].append(full)
        return copy.deepcopy(full)

    def _upsert(self, row: Row) -> Row:
        keys = [k.strip() for k in self.on_conflict.split(",") if k.strip()] or ["id"]
        for existing in self.db.tables[self.table]:
            if all(_key(existing.get(k)) == _key(row.get(k)) for k in keys):
                existing.update(copy.deepcopy(row))
                return copy.deepcopy(existing)
        return self._insert(row)

    def _check(self, columns: Any) -> None:
        unknown = set(columns) - COLUMNS[self.table]
        if unknown:
            raise KeyError(f"unknown column(s) {sorted(unknown)} on {self.table}")


class FakeDb:
    def __init__(self) -> None:
        self.tables: dict[str, list[Row]] = {name: [] for name in COLUMNS}
        self.rpc_calls: list[tuple[str, dict[str, Any] | None]] = []
        self._action_ids = itertools.count(1)

    def table(self, name: str) -> Query:
        return Query(self, name)

    def rpc(self, fn: str, params: dict[str, Any] | None = None) -> Query:
        self.rpc_calls.append((fn, params))
        return Query(self, "merchants").limit(0)

    def defaults(self, table: str) -> Row:
        now = now_iso()
        return {
            "calls": {"id": str(uuid4()), "device_id": None, "bolna_execution_id": None, "status": "queued",
                      "started_at": now, "ended_at": None, "duration_s": None, "cost_cents": None,
                      "transcript": None, "summary": None, "outcome": None, "raw": None},
            "actions": {"id": next(self._action_ids), "call_id": None, "device_id": None, "payload": {},
                        "actor": "agent", "created_at": now},
            "handoffs": {"id": str(uuid4()), "call_id": None, "next_step": None, "status": "open", "created_at": now},
            "tickets": {"id": str(uuid4()), "status": "open", "created_at": now},
            "settlements": {"id": str(uuid4())},
        }.get(table, {})

    # helpers for assertions
    def rows(self, table: str, **match: Any) -> list[Row]:
        return [row for row in self.tables[table] if all(row.get(k) == v for k, v in match.items())]

    def one(self, table: str, **match: Any) -> Row:
        found = self.rows(table, **match)
        assert len(found) == 1, f"expected one {table} row for {match}, found {len(found)}"
        return found[0]


def seed_demo(db: FakeDb) -> FakeDb:
    """A small version of 0002_seed_demo: the five scripted merchants plus two holdout fillers."""
    today = datetime.now(UTC).date()
    scripted = [
        # id, name, owner, lang, fault, rent, days silent, reason, score, settlement, settled days ago
        ("M001", "Sharma General Store", "Ramesh Sharma", "hi", "speaker_fault", "paid", 4,
         "Silent 4 days · QR −80%", 70, 18450, 3),
        ("M002", "Patil Medical", "Sunita Patil", "mr", "no_network", "paid", 3,
         "Silent 3 days · QR −90%", 70, 22100, 4),
        ("M003", "Shaikh Chai Corner", "Imran Shaikh", "hi", "none", "paid", 1,
         "QR −70% · Open complaint", 40, 6200, 5),
        ("M004", "Joshi Stationers", "Anil Joshi", "mr", "none", "failed", 1,
         "QR −65% · Rent debit failed · Open complaint", 60, 9800, 6),
        ("M005", "Fernandes Bakery", "Maria Fernandes", "hi", "none", "paid", 2, "QR −90%", 30, 12300, 7),
    ]
    holdout = [("F010", "Rao Kirana", "Anand Rao", "hi", "none", "failed", 1, "Rent debit failed", 20, 5000, 2),
               ("F023", "Iyer Snacks", "Deepa Iyer", "hi", "none", "paid", 1, "Open complaint", 10, 4000, 2)]
    for mid, name, owner, lang, fault, rent, silent, reason, score, amount, ago in scripted + holdout:
        cohort = "holdout" if mid.startswith("F") else "wapsi"
        db.tables["merchants"].append({"id": mid, "name": name, "owner_name": owner, "area": "Mumbai",
                                       "language": lang, "phone": None, "cohort": cohort,
                                       "scripted": cohort == "wapsi", "created_at": now_iso()})
        db.tables["devices"].append({"id": f"SB-{mid}", "merchant_id": mid, "model": "Soundbox",
                                     "status": "at_risk", "fault": fault, "rent_status": rent, "monthly_rent": 100,
                                     "last_announced_at": now_iso(-timedelta(days=silent, hours=2)),
                                     "at_risk_since": now_iso(-timedelta(hours=12)), "updated_at": now_iso()})
        db.tables["risk_queue"].append({"device_id": f"SB-{mid}", "merchant_id": mid, "name": name,
                                        "owner_name": owner, "area": "Mumbai", "language": lang, "cohort": cohort,
                                        "scripted": cohort == "wapsi", "status": "at_risk", "fault": fault,
                                        "rent_status": rent, "days_silent": silent, "qr_drop_pct": 0,
                                        "open_ticket": False, "risk_score": score, "reason": reason})
        db.tables["settlements"].append({"id": str(uuid4()), "merchant_id": mid,
                                         "settled_on": (today - timedelta(days=ago)).isoformat(), "amount": amount})
        for d in range(4, 31):  # baseline 45 a day at ₹180 a txn
            db.tables["daily_volume"].append({"device_id": f"SB-{mid}", "day": (today - timedelta(days=d)).isoformat(),
                                              "txn_count": 45, "amount": 45 * 180})
    db.tables["tickets"] += [
        {"id": str(uuid4()), "merchant_id": "M003", "type": "settlement_query", "status": "open", "created_at": now_iso()},
        {"id": str(uuid4()), "merchant_id": "M004", "type": "rent_dispute", "status": "open", "created_at": now_iso()},
    ]
    return db
