"use client";

export type AgentStatus = "confirm" | "done" | "error" | "info";

export type AgentAction = {
  tool: string;
  params: Record<string, unknown>;
};

export type TableComponentData = {
  type: "table";
  headers: string[];
  rows: (string | number)[][];
  footer?: {
    label: string;
    value: string | number;
  }[];
};

export type SummaryCardComponentData = {
  type: "summary_card";
  items: {
    label: string;
    value: string;
    highlight?: "green" | "red" | "neutral";
  }[];
};

export type ListComponentData = {
  type: "list";
  items: {
    title: string;
    subtitle?: string;
    badge?: string;
    badgeColor?: "red" | "green" | "yellow";
  }[];
};

export type ChartComponentData = {
  type: "chart";
  chartType: "bar" | "line" | "donut";
  labels: string[];
  datasets: {
    label: string;
    data: number[];
  }[];
};

export type InvoiceComponentData = {
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
  sundry: {
    name: string;
    amount: number;
  }[];
  total: number;
  paid: number;
  due: number;
};

export type ResponseComponent =
  | TableComponentData
  | SummaryCardComponentData
  | ListComponentData
  | ChartComponentData
  | InvoiceComponentData;

export type AgentResponse = {
  id: string;
  status: AgentStatus;
  message: string;
  action?: AgentAction;
  component?: ResponseComponent;
  requiresConfirm: boolean;
};

export type DummyConversationItem =
  | {
      id: string;
      role: "user";
      message: string;
    }
  | {
      id: string;
      role: "agent";
      response: AgentResponse;
    };

const agent = (id: string, response: AgentResponse): DummyConversationItem => ({
  id,
  role: "agent",
  response,
});

const user = (id: string, message: string): DummyConversationItem => ({
  id,
  role: "user",
  message,
});

export const responseLibrary = {
  askBillDetails: {
    id: "resp_ask_bill_details",
    status: "info",
    message: "Sure. Tell me party name, item, quantity, and payment mode.",
    requiresConfirm: false,
  } satisfies AgentResponse,

  saleBillDraft: {
    id: "resp_sale_bill_draft",
    status: "confirm",
    message:
      "I understood the bill for Nilesh Munde. Please confirm before I create it.",
    action: {
      tool: "create_sale_bill",
      params: {
        party: "Nilesh Munde",
        payment_mode: "credit",
        items: [{ item_id: "sku_ultratech_ppc_50kg", qty: 5 }],
      },
    },
    component: {
      type: "table",
      headers: ["Item", "Qty", "Unit", "Rate", "Total"],
      rows: [["Ultratech PPC 50kg", 5, "bags", 320, 1600]],
      footer: [
        { label: "Total", value: "Rs 1,600.00" },
        { label: "Paid", value: "Rs 0.00" },
        { label: "Due", value: "Rs 1,600.00" },
      ],
    },
    requiresConfirm: true,
  } satisfies AgentResponse,

  saleBillCreated: {
    id: "resp_sale_bill_done",
    status: "done",
    message: "Bill INV-2026-000012 created for Nilesh Munde. Stock updated.",
    component: {
      type: "invoice",
      billNumber: "INV-2026-000012",
      party: "Nilesh Munde",
      date: "05 April 2026",
      paymentMode: "Credit",
      items: [
        {
          name: "Ultratech PPC 50kg",
          qty: 5,
          unit: "bags",
          rate: 320,
          total: 1600,
        },
      ],
      sundry: [{ name: "Hamali", amount: 50 }],
      total: 1650,
      paid: 0,
      due: 1650,
    },
    requiresConfirm: false,
  } satisfies AgentResponse,

  purchaseBillDraft: {
    id: "resp_purchase_bill_draft",
    status: "confirm",
    message:
      "I prepared a purchase bill for Shree Ganesh Traders. Please confirm before I save it.",
    action: {
      tool: "create_purchase_bill",
      params: {
        party: "Shree Ganesh Traders",
        payment_mode: "bank_transfer",
        items: [
          { item_id: "sku_jk_putty_40kg", qty: 25 },
          { item_id: "sku_pvc_bend_15", qty: 40 },
        ],
      },
    },
    component: {
      type: "table",
      headers: ["Item", "Qty", "Unit", "Rate", "Total"],
      rows: [
        ["JK Wall Putty 40kg", 25, "bags", 760, 19000],
        ["PVC Bend 1.5 inch", 40, "pcs", 28, 1120],
      ],
      footer: [
        { label: "Transport", value: "Rs 450.00" },
        { label: "Paid", value: "Rs 20,570.00" },
        { label: "Total", value: "Rs 20,570.00" },
      ],
    },
    requiresConfirm: true,
  } satisfies AgentResponse,

  paymentReceivedDraft: {
    id: "resp_payment_received_draft",
    status: "confirm",
    message:
      "I am ready to record a cash payment of Rs 5,000 received from Nilesh Munde. Please confirm.",
    action: {
      tool: "record_payment_received",
      params: {
        party: "Nilesh Munde",
        amount: 5000,
        mode: "cash",
      },
    },
    component: {
      type: "summary_card",
      items: [
        { label: "Party", value: "Nilesh Munde", highlight: "neutral" },
        { label: "Amount", value: "Rs 5,000.00", highlight: "green" },
        { label: "Mode", value: "Cash", highlight: "neutral" },
        { label: "Balance After", value: "Rs 14,680.00", highlight: "red" },
      ],
    },
    requiresConfirm: true,
  } satisfies AgentResponse,

  paymentSentDraft: {
    id: "resp_payment_sent_draft",
    status: "confirm",
    message:
      "I am ready to record a bank transfer of Rs 8,500 sent to Ambika Hardware. Please confirm.",
    action: {
      tool: "record_payment_sent",
      params: {
        party: "Ambika Hardware",
        amount: 8500,
        mode: "bank_transfer",
      },
    },
    component: {
      type: "summary_card",
      items: [
        { label: "Supplier", value: "Ambika Hardware", highlight: "neutral" },
        { label: "Amount", value: "Rs 8,500.00", highlight: "red" },
        { label: "Mode", value: "Bank Transfer", highlight: "neutral" },
        { label: "Balance After", value: "Rs 2,150.00", highlight: "green" },
      ],
    },
    requiresConfirm: true,
  } satisfies AgentResponse,

  checkStockInfo: {
    id: "resp_check_stock_info",
    status: "info",
    message: "Ultratech PPC 50kg stock looks safe for today.",
    action: {
      tool: "check_stock",
      params: { item: "Ultratech PPC 50kg" },
    },
    component: {
      type: "summary_card",
      items: [
        { label: "Item", value: "Ultratech PPC 50kg", highlight: "neutral" },
        { label: "Available", value: "142 bags", highlight: "green" },
        { label: "Reserved", value: "18 bags", highlight: "neutral" },
        { label: "Reorder Level", value: "40 bags", highlight: "neutral" },
      ],
    },
    requiresConfirm: false,
  } satisfies AgentResponse,

  lowStockInfo: {
    id: "resp_low_stock_info",
    status: "info",
    message: "These items are running low on stock.",
    action: {
      tool: "list_low_stock_items",
      params: {},
    },
    component: {
      type: "list",
      items: [
        {
          title: "Ultratech PPC 50kg",
          subtitle: "5 bags remaining",
          badge: "Low Stock",
          badgeColor: "red",
        },
        {
          title: "Elevation Tiles 2x2",
          subtitle: "8 boxes remaining",
          badge: "Watch",
          badgeColor: "yellow",
        },
        {
          title: "CPVC Elbow 1 inch",
          subtitle: "34 pcs remaining",
          badge: "Okay",
          badgeColor: "green",
        },
      ],
    },
    requiresConfirm: false,
  } satisfies AgentResponse,

  stockAdjustmentDraft: {
    id: "resp_stock_adjustment_draft",
    status: "confirm",
    message:
      "I am ready to reduce PVC Solvent Cement by 3 pieces for damaged stock. Please confirm.",
    action: {
      tool: "update_stock_manually",
      params: {
        item: "PVC Solvent Cement 500ml",
        delta: -3,
        reason: "Damaged in transport",
      },
    },
    component: {
      type: "summary_card",
      items: [
        {
          label: "Item",
          value: "PVC Solvent Cement 500ml",
          highlight: "neutral",
        },
        { label: "Adjustment", value: "-3 pcs", highlight: "red" },
        { label: "Reason", value: "Damaged in transport", highlight: "neutral" },
        { label: "Stock After", value: "27 pcs", highlight: "neutral" },
      ],
    },
    requiresConfirm: true,
  } satisfies AgentResponse,

  partyBalanceInfo: {
    id: "resp_party_balance_info",
    status: "info",
    message:
      "Nilesh Munde has an outstanding balance of Rs 19,680. Last payment was received 3 days ago.",
    action: {
      tool: "get_party_balance",
      params: { party: "Nilesh Munde" },
    },
    component: {
      type: "summary_card",
      items: [
        { label: "Outstanding", value: "Rs 19,680.00", highlight: "red" },
        { label: "Last Payment", value: "3 days ago", highlight: "neutral" },
        { label: "Payment Mode", value: "Cash", highlight: "neutral" },
        { label: "Credit Days", value: "21 days", highlight: "neutral" },
      ],
    },
    requiresConfirm: false,
  } satisfies AgentResponse,

  pendingDuesInfo: {
    id: "resp_pending_dues_info",
    status: "info",
    message: "Here are the parties with pending dues that need follow-up.",
    action: {
      tool: "list_pending_dues",
      params: {},
    },
    component: {
      type: "list",
      items: [
        {
          title: "Nilesh Munde",
          subtitle: "Rs 19,680 overdue by 8 days",
          badge: "High",
          badgeColor: "red",
        },
        {
          title: "Sai Construction",
          subtitle: "Rs 8,250 due tomorrow",
          badge: "Upcoming",
          badgeColor: "yellow",
        },
        {
          title: "Rutuja Enterprises",
          subtitle: "Rs 3,100 due this week",
          badge: "Normal",
          badgeColor: "green",
        },
      ],
    },
    requiresConfirm: false,
  } satisfies AgentResponse,

  ledgerInfo: {
    id: "resp_party_ledger_info",
    status: "info",
    message: "I found the recent ledger entries for Nilesh Munde.",
    action: {
      tool: "get_party_ledger",
      params: { party: "Nilesh Munde", range: "last_30_days" },
    },
    component: {
      type: "table",
      headers: ["Date", "Particulars", "Debit", "Credit", "Balance"],
      rows: [
        ["28 Mar", "Sale Bill INV-2026-000009", "Rs 6,450", "-", "Rs 6,450"],
        ["01 Apr", "Payment Received", "-", "Rs 2,000", "Rs 4,450"],
        ["03 Apr", "Sale Bill INV-2026-000011", "Rs 15,230", "-", "Rs 19,680"],
      ],
      footer: [{ label: "Closing Balance", value: "Rs 19,680.00" }],
    },
    requiresConfirm: false,
  } satisfies AgentResponse,

  partySearchInfo: {
    id: "resp_party_search_info",
    status: "info",
    message: "I found these matching parties for your search.",
    action: {
      tool: "find_party",
      params: { query: "nilesh" },
    },
    component: {
      type: "list",
      items: [
        {
          title: "Nilesh Munde",
          subtitle: "Retail customer - Hingoli",
          badge: "Exact",
          badgeColor: "green",
        },
        {
          title: "Nilesh Traders",
          subtitle: "Supplier - Nanded",
          badge: "Similar",
          badgeColor: "yellow",
        },
        {
          title: "Nilesh Building Works",
          subtitle: "Contractor - Basmat",
          badge: "Review",
          badgeColor: "red",
        },
      ],
    },
    requiresConfirm: false,
  } satisfies AgentResponse,

  createPartyDraft: {
    id: "resp_create_party_draft",
    status: "confirm",
    message:
      "I prepared a new customer entry for Om Sai Builders. Please confirm to create it.",
    action: {
      tool: "create_party",
      params: {
        name: "Om Sai Builders",
        phone: "9876543210",
        city: "Parbhani",
        type: "customer",
      },
    },
    component: {
      type: "summary_card",
      items: [
        { label: "Name", value: "Om Sai Builders", highlight: "neutral" },
        { label: "Type", value: "Customer", highlight: "green" },
        { label: "Phone", value: "+91 98765 43210", highlight: "neutral" },
        { label: "City", value: "Parbhani", highlight: "neutral" },
      ],
    },
    requiresConfirm: true,
  } satisfies AgentResponse,

  cashPositionInfo: {
    id: "resp_cash_position_info",
    status: "info",
    message: "Here is the current cash position for today.",
    action: {
      tool: "get_cash_position",
      params: {},
    },
    component: {
      type: "summary_card",
      items: [
        { label: "Cash in Hand", value: "Rs 48,720.00", highlight: "green" },
        { label: "UPI", value: "Rs 21,380.00", highlight: "green" },
        { label: "Bank", value: "Rs 15,000.00", highlight: "neutral" },
        { label: "Petty Cash Out", value: "Rs 2,140.00", highlight: "red" },
      ],
    },
    requiresConfirm: false,
  } satisfies AgentResponse,

  todaysRevenueInfo: {
    id: "resp_todays_revenue_info",
    status: "info",
    message: "Today's revenue till now is Rs 89,420 across 17 bills.",
    action: {
      tool: "get_todays_revenue",
      params: {},
    },
    component: {
      type: "summary_card",
      items: [
        { label: "Revenue", value: "Rs 89,420.00", highlight: "green" },
        { label: "Bills", value: "17", highlight: "neutral" },
        { label: "Average Bill", value: "Rs 5,260.00", highlight: "neutral" },
        { label: "Top Category", value: "Cement", highlight: "neutral" },
      ],
    },
    requiresConfirm: false,
  } satisfies AgentResponse,

  notFoundError: {
    id: "resp_party_not_found_error",
    status: "error",
    message:
      "I could not find a party named Ramesh Borele. Do you want to create a new party?",
    requiresConfirm: false,
  } satisfies AgentResponse,
} as const;

export const initialAgentResponse: AgentResponse = responseLibrary.saleBillDraft;

export const dummyConversation: DummyConversationItem[] = [
  user("user_1", "make a bill"),
  agent("agent_1", responseLibrary.askBillDetails),
  user("user_2", "Nilesh Munde, 5 Ultratech PPC 50kg, credit"),
  agent("agent_2", responseLibrary.saleBillDraft),
  user("user_3", "confirm"),
  agent("agent_3", responseLibrary.saleBillCreated),

  user("user_4", "make purchase bill for Shree Ganesh Traders"),
  agent("agent_4", responseLibrary.purchaseBillDraft),

  user("user_5", "record 5000 cash received from Nilesh Munde"),
  agent("agent_5", responseLibrary.paymentReceivedDraft),

  user("user_6", "pay Ambika Hardware 8500 by bank"),
  agent("agent_6", responseLibrary.paymentSentDraft),

  user("user_7", "check stock of Ultratech PPC 50kg"),
  agent("agent_7", responseLibrary.checkStockInfo),

  user("user_8", "show low stock items"),
  agent("agent_8", responseLibrary.lowStockInfo),

  user("user_9", "reduce pvc solvent cement by 3 pieces damaged"),
  agent("agent_9", responseLibrary.stockAdjustmentDraft),

  user("user_10", "how much balance is pending for Nilesh Munde"),
  agent("agent_10", responseLibrary.partyBalanceInfo),

  user("user_11", "show all pending dues"),
  agent("agent_11", responseLibrary.pendingDuesInfo),

  user("user_12", "show Nilesh ledger"),
  agent("agent_12", responseLibrary.ledgerInfo),

  user("user_13", "find Nilesh"),
  agent("agent_13", responseLibrary.partySearchInfo),

  user("user_14", "create new party Om Sai Builders"),
  agent("agent_14", responseLibrary.createPartyDraft),

  user("user_15", "what is today's revenue"),
  agent("agent_15", responseLibrary.todaysRevenueInfo),

  user("user_16", "what is current cash position"),
  agent("agent_16", responseLibrary.cashPositionInfo),

  user("user_17", "show balance for Ramesh Borele"),
  agent("agent_17", responseLibrary.notFoundError),
];
