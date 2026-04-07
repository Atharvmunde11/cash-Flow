this backend is explicitly for agent and tooling because adding it in the /src/api/ folder would make the project much more complicated and hard to debug.

# Ledger Studio — Agent Response Spec

## Overview

The agent receives a user's voice input (transcribed via Whisper), determines the intent, calls the right tool, and returns a structured response object. The frontend renders this response — plain message text as a chat bubble, and the `component` field as a rich visual UI element.

---

## Response Structure

Every agent response follows this shape:

```ts
type AgentResponse = {
  id: string; // unique response id (uuid)
  status: "confirm" | "done" | "error" | "info";
  message: string; // plain text shown in chat bubble
  action?: AgentAction; // the tool that will be / was called
  component?: ResponseComponent; // optional visual to render
  requiresConfirm: boolean; // if true, show Confirm / Cancel buttons
};
```

### Status meanings

| Status    | When to use                                                              |
| --------- | ------------------------------------------------------------------------ |
| `confirm` | Agent is about to do something destructive or financial — ask user first |
| `done`    | Action completed successfully                                            |
| `error`   | Something went wrong                                                     |
| `info`    | Read-only response, just showing data                                    |

---

## Action Object

```ts
type AgentAction = {
  tool: string; // name of the tool to call e.g. "create_sale_bill"
  params: Record<string, any>; // resolved parameters
};
```

---

## Component Types

The `component` field tells the frontend what visual to render alongside the message.

```ts
type ResponseComponent =
  | TableComponent
  | SummaryCardComponent
  | ListComponent
  | ChartComponent
  | InvoiceComponent;
```

### 1. Table

Use for: bill line items, inventory list, ledger activity

```ts
type TableComponent = {
  type: "table";
  headers: string[];
  rows: (string | number)[][];
  footer?: {
    label: string;
    value: string | number;
  }[];
};
```

### 2. Summary Card

Use for: cash position, today's revenue, party balance

```ts
type SummaryCardComponent = {
  type: "summary_card";
  items: {
    label: string;
    value: string;
    highlight?: "green" | "red" | "neutral";
  }[];
};
```

### 3. List

Use for: low stock items, pending dues, search results

```ts
type ListComponent = {
  type: "list";
  items: {
    title: string;
    subtitle?: string;
    badge?: string;
    badgeColor?: "red" | "green" | "yellow";
  }[];
};
```

### 4. Chart

Use for: daily revenue, category mix

```ts
type ChartComponent = {
  type: "chart";
  chartType: "bar" | "line" | "donut";
  labels: string[];
  datasets: {
    label: string;
    data: number[];
  }[];
};
```

### 5. Invoice

Use for: showing a created bill in full detail

```ts
type InvoiceComponent = {
  type: "invoice";
  billNumber: string;
  party: string;
  date: string;
  paymentMode: string;
  items: {
    name: string;
    qty: number;
    unit: string;
    rate: number;
    total: number;
  }[];
  sundry:[{
        name:string,
        amount:amount,
    }],;
  total: number;
  paid: number;
  due: number;
};
```

---

## Full Examples

### Create Sale Bill (requires confirmation)

User says: _"nilesh ne 5 bag cement liya, udhaar pe"_

```json
{
  "id": "resp_001",
  "status": "confirm",
  "message": "Sure, I'll create a credit sale bill for Nilesh Munde — 5 bags of Ultratech PPC 50kg. Please confirm.",
  "action": {
    "tool": "create_sale_bill",
    "params": {
      "party": "nilesh munde",
      "payment_mode": "credit",
      "items": [{ "item_id": "sku_001", "qty": 5 }]
    }
  },
  "component": {
    "type": "table",
    "headers": ["Item", "Qty", "Unit", "Rate", "Total"],
    "rows": [["Ultratech PPC 50kg", 5, "bags", 320, 1600]],
    "footer": [
      { "label": "Total", "value": "₹1,600.00" },
      { "label": "Paid", "value": "₹0.00" },
      { "label": "Due", "value": "₹1,600.00" }
    ]
  },
  "requiresConfirm": true
}
```

---

### Check Party Balance (info, no confirmation needed)

User says: _"nilesh ka kitna baaki hai?"_

```json
{
  "id": "resp_002",
  "status": "info",
  "message": "Nilesh Munde has an outstanding balance of ₹19,680. Last payment was received 3 days ago.",
  "action": {
    "tool": "get_party_balance",
    "params": { "party": "nilesh munde" }
  },
  "component": {
    "type": "summary_card",
    "items": [
      {
        "label": "Outstanding Balance",
        "value": "₹19,680.00",
        "highlight": "red"
      },
      {
        "label": "Last Payment",
        "value": "3 days ago",
        "highlight": "neutral"
      },
      { "label": "Payment Mode", "value": "Cash", "highlight": "neutral" }
    ]
  },
  "requiresConfirm": false
}
```

---

### Low Stock Alert

User says: _"kya koi item kam hai?"_

```json
{
  "id": "resp_003",
  "status": "info",
  "message": "2 items are running low on stock.",
  "action": {
    "tool": "list_low_stock_items",
    "params": {}
  },
  "component": {
    "type": "list",
    "items": [
      {
        "title": "Ultratech PPC 50kg",
        "subtitle": "5 bags remaining",
        "badge": "Low Stock",
        "badgeColor": "red"
      },
      {
        "title": "Elevation Tiles",
        "subtitle": "8 boxes remaining",
        "badge": "Low Stock",
        "badgeColor": "yellow"
      }
    ]
  },
  "requiresConfirm": false
}
```

---

### Record Payment Received (requires confirmation)

User says: _"nilesh ne 5000 cash diya"_

```json
{
  "id": "resp_004",
  "status": "confirm",
  "message": "Got it — I'll record a cash payment of ₹5,000 received from Nilesh Munde. Confirm?",
  "action": {
    "tool": "record_payment_received",
    "params": {
      "party": "nilesh munde",
      "amount": 5000,
      "mode": "cash"
    }
  },
  "component": {
    "type": "summary_card",
    "items": [
      { "label": "Party", "value": "Nilesh Munde", "highlight": "neutral" },
      { "label": "Amount", "value": "₹5,000.00", "highlight": "green" },
      { "label": "Mode", "value": "Cash", "highlight": "neutral" }
    ]
  },
  "requiresConfirm": true
}
```

---

### Bill Created Successfully (done state)

After user confirms the bill creation:

```json
{
  "id": "resp_005",
  "status": "done",
  "message": "Bill INV-2026-000012 created for Nilesh Munde. Stock updated.",
  "component": {
    "type": "invoice",
    "billNumber": "INV-2026-000012",
    "party": "Nilesh Munde",
    "date": "April 5, 2026",
    "paymentMode": "Credit",
    "items": [
      {
        "name": "Ultratech PPC 50kg",
        "qty": 5,
        "unit": "bags",
        "rate": 320,
        "total": 1600
      }
    ],
    "sundry": [
      {
        "name": "hamali",
        "amount": 50
      }
    ],
    "total": 1650,
    "paid": 0,
    "due": 1650
  },
  "requiresConfirm": false
}
```

---

## Confirmation Flow

```
User speaks
    ↓
Whisper transcribes
    ↓
Agent resolves intent + params
    ↓
requiresConfirm = true?
    ├── YES → show message + component + [Confirm] [Cancel] buttons
    │             ↓ user confirms
    │         Execute tool → return status: "done"
    └── NO  → Execute tool immediately → return status: "done" or "info"
```

**Rule of thumb:** Any action that writes data (creates bill, records payment, updates stock) requires confirmation. Any read-only action (check balance, list stock) does not.

---

## Error Response

```json
{
  "id": "resp_006",
  "status": "error",
  "message": "I couldn't find a party named 'Ramesh'. Do you want to create a new party?",
  "requiresConfirm": false
}
```

---

## Tools Reference

| Tool                      | Requires Confirm | Component       |
| ------------------------- | ---------------- | --------------- |
| `create_sale_bill`        | ✅               | table → invoice |
| `create_purchase_bill`    | ✅               | table → invoice |
| `record_payment_received` | ✅               | summary_card    |
| `record_payment_sent`     | ✅               | summary_card    |
| `check_stock`             | ❌               | summary_card    |
| `list_low_stock_items`    | ❌               | list            |
| `update_stock_manually`   | ✅               | summary_card    |
| `get_party_balance`       | ❌               | summary_card    |
| `list_pending_dues`       | ❌               | list            |
| `get_party_ledger`        | ❌               | table           |
| `find_party`              | ❌               | list            |
| `create_party`            | ✅               | summary_card    |
| `get_todays_revenue`      | ❌               | summary_card    |
| `get_cash_position`       | ❌               | summary_card    |
