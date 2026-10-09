import React from "react";
import { apiUrl } from "../../lib/apiBase";

type MaterialMove = {
  id: string;
  dir?: string;
  direction?: string;
  qty: number;
  date?: string;
  note?: string | null;
};

type Material = {
  id: string;
  name: string;
  code?: string | null;
  location?: string | null;
  unit?: string | null;
  stock: number;
  minStock: number;
  priceNet: number;
  supplier?: string | null;
  projectId?: string | null;
  costCenter?: string | null;
  moves?: MaterialMove[];
};

type OrderLine = {
  id: string;
  materialId?: string | null;
  code?: string | null;
  name: string;
  unit?: string | null;
  qty: number;
  priceNet: number;
};

type PurchaseOrder = {
  id: string;
  number: string;
  supplier?: string | null;
  projectId?: string | null;
  costCenter?: string | null;
  status: string;
  orderDate?: string | null;
  deliveryDate?: string | null;
  notes?: string | null;
  lines?: OrderLine[];
};

function authHeaders(): Record<string, string> {
  for (const key of [
    "rlc_token",
    "token",
    "authToken",
    "accessToken",
    "rlc_auth_token"
  ]) {
    const token =
      localStorage.getItem(key) ||
      sessionStorage.getItem(key);

    if (token?.trim()) {
      return {
        Authorization: `Bearer ${token.trim()}`
      };
    }
  }

  return {};
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...authHeaders(),
      ...(init?.headers || {})
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      payload?.error ||
      payload?.message ||
      `HTTP ${response.status}`
    );
  }

  return payload;
}

function dateInput(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d7deea",
  borderRadius: 7,
  padding: "8px 9px",
  fontSize: 13,
  background: "#fff"
};

export default function Lager() {
  const [tab, setTab] =
    React.useState<"stock" | "orders">("stock");

  const [items, setItems] =
    React.useState<Material[]>([]);

  const [orders, setOrders] =
    React.useState<PurchaseOrder[]>([]);

  const [selectedId, setSelectedId] =
    React.useState<string | null>(null);

  const [selectedOrderId, setSelectedOrderId] =
    React.useState<string | null>(null);

  const [draft, setDraft] =
    React.useState<Material | null>(null);

  const [orderDraft, setOrderDraft] =
    React.useState<PurchaseOrder | null>(null);

  const [dirty, setDirty] =
    React.useState(false);

  const [orderDirty, setOrderDirty] =
    React.useState(false);

  const [query, setQuery] =
    React.useState("");

  const [onlyLow, setOnlyLow] =
    React.useState(false);

  const [loading, setLoading] =
    React.useState(false);

  const [error, setError] =
    React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [materialData, orderData] =
        await Promise.all([
          request("/api/resource-costs/materials"),
          request("/api/resource-costs/purchase-orders")
        ]);

      const nextItems =
        Array.isArray(materialData?.items)
          ? materialData.items
          : [];

      const nextOrders =
        Array.isArray(orderData?.items)
          ? orderData.items
          : [];

      setItems(nextItems);
      setOrders(nextOrders);

      setSelectedId((current) =>
        current &&
        nextItems.some((x: Material) => x.id === current)
          ? current
          : nextItems[0]?.id || null
      );

      setSelectedOrderId((current) =>
        current &&
        nextOrders.some((x: PurchaseOrder) => x.id === current)
          ? current
          : nextOrders[0]?.id || null
      );
    } catch (e: any) {
      setError(
        e?.message ||
        "Lagerdaten konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selected = React.useMemo(
    () =>
      items.find((x) => x.id === selectedId) || null,
    [items, selectedId]
  );

  const selectedOrder = React.useMemo(
    () =>
      orders.find((x) => x.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

  React.useEffect(() => {
    setDraft(selected ? { ...selected } : null);
    setDirty(false);
  }, [selected]);

  React.useEffect(() => {
    setOrderDraft(
      selectedOrder
        ? {
            ...selectedOrder,
            lines: [...(selectedOrder.lines || [])]
          }
        : null
    );

    setOrderDirty(false);
  }, [selectedOrder]);

  const filtered = React.useMemo(() => {
    const qn = query.trim().toLowerCase();

    return items.filter((item) => {
      const text = [
        item.name,
        item.code,
        item.location,
        item.supplier
      ]
        .join(" ")
        .toLowerCase();

      const low =
        Number(item.stock || 0) <=
        Number(item.minStock || 0);

      return (
        (!qn || text.includes(qn)) &&
        (!onlyLow || low)
      );
    });
  }, [items, query, onlyLow]);

  const totalStockValue = items.reduce(
    (sum, item) =>
      sum +
      Number(item.stock || 0) *
        Number(item.priceNet || 0),
    0
  );

  const lowCount = items.filter(
    (item) =>
      Number(item.stock || 0) <=
      Number(item.minStock || 0)
  ).length;

  const openOrderValue = orders
    .filter(
      (order) =>
        !["GELIEFERT", "STORNIERT"].includes(
          String(order.status || "").toUpperCase()
        )
    )
    .reduce(
      (sum, order) =>
        sum +
        (order.lines || []).reduce(
          (lineSum, line) =>
            lineSum +
            Number(line.qty || 0) *
              Number(line.priceNet || 0),
          0
        ),
      0
    );

  const createMaterial = async () => {
    const result = await request(
      "/api/resource-costs/materials",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Neuer Artikel",
          unit: "Stk"
        })
      }
    );

    await load();

    if (result?.item?.id) {
      setSelectedId(result.item.id);
    }
  };

  const saveMaterial = async () => {
    if (!draft) return;

    await request(
      `/api/resource-costs/materials/${draft.id}`,
      {
        method: "PUT",
        body: JSON.stringify(draft)
      }
    );

    await load();
    setDirty(false);
  };

  const deleteMaterial = async () => {
    if (!draft) return;

    if (!confirm("Artikel wirklich löschen?")) {
      return;
    }

    await request(
      `/api/resource-costs/materials/${draft.id}`,
      {
        method: "DELETE"
      }
    );

    setSelectedId(null);
    await load();
  };

  const move = async (direction: "IN" | "OUT") => {
    if (!draft) return;

    const qty = Number(
      prompt(
        direction === "IN"
          ? "Eingangsmenge:"
          : "Ausgangsmenge:",
        "1"
      )
    );

    if (!(qty > 0)) return;

    await request(
      `/api/resource-costs/materials/${draft.id}/moves`,
      {
        method: "POST",
        body: JSON.stringify({
          direction,
          qty
        })
      }
    );

    await load();
  };

  const createOrder = async () => {
    const result = await request(
      "/api/resource-costs/purchase-orders",
      {
        method: "POST",
        body: JSON.stringify({})
      }
    );

    await load();

    if (result?.item?.id) {
      setSelectedOrderId(result.item.id);
      setTab("orders");
    }
  };

  const saveOrder = async () => {
    if (!orderDraft) return;

    await request(
      `/api/resource-costs/purchase-orders/${orderDraft.id}`,
      {
        method: "PUT",
        body: JSON.stringify(orderDraft)
      }
    );

    await load();
    setOrderDirty(false);
  };

  const deleteOrder = async () => {
    if (!orderDraft) return;

    if (!confirm("Bestellung wirklich löschen?")) {
      return;
    }

    await request(
      `/api/resource-costs/purchase-orders/${orderDraft.id}`,
      {
        method: "DELETE"
      }
    );

    setSelectedOrderId(null);
    setOrderDraft(null);
    await load();
  };

  const updateOrderLine = async (
    line: OrderLine,
    patch: Partial<OrderLine>
  ) => {
    if (!orderDraft) return;

    const next = {
      ...line,
      ...patch
    };

    await request(
      `/api/resource-costs/purchase-orders/${orderDraft.id}/lines/${line.id}`,
      {
        method: "PUT",
        body: JSON.stringify(next)
      }
    );

    await load();
  };

  const deleteOrderLine = async (lineId: string) => {
    if (!orderDraft) return;

    await request(
      `/api/resource-costs/purchase-orders/${orderDraft.id}/lines/${lineId}`,
      {
        method: "DELETE"
      }
    );

    await load();
  };

  const addToOrder = async (material: Material) => {
    let order = orderDraft;

    if (!order) {
      const created = await request(
        "/api/resource-costs/purchase-orders",
        {
          method: "POST",
          body: JSON.stringify({
            supplier: material.supplier || ""
          })
        }
      );

      order = created.item;
    }

    if (!order?.id) {
      throw new Error("Bestellung konnte nicht erstellt werden.");
    }

    await request(
      `/api/resource-costs/purchase-orders/${order.id}/lines`,
      {
        method: "POST",
        body: JSON.stringify({
          materialId: material.id,
          qty: Math.max(
            1,
            Number(material.minStock || 0) -
              Number(material.stock || 0)
          )
        })
      }
    );

    await load();
    setSelectedOrderId(order.id);
    setTab("orders");
  };

  const orderTotal = (order?: PurchaseOrder | null) =>
    (order?.lines || []).reduce(
      (sum, line) =>
        sum +
        Number(line.qty || 0) *
          Number(line.priceNet || 0),
      0
    );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 10
        }}
      >
        {[
          ["Artikel", items.length],
          ["Unterbestand", lowCount],
          [
            "Lagerwert",
            `${totalStockValue.toFixed(2)} €`
          ],
          [
            "Offene Bestellungen",
            `${openOrderValue.toFixed(2)} €`
          ]
        ].map(([label, value]) => (
          <div className="card" key={String(label)}>
            <div className="muted">{label}</div>
            <strong style={{ fontSize: 23 }}>
              {value}
            </strong>
          </div>
        ))}
      </section>

      <section
        className="card"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center"
        }}
      >
        <button
          className={
            tab === "stock"
              ? "btn btn-primary"
              : "btn"
          }
          onClick={() => setTab("stock")}
        >
          Lagerbestand
        </button>

        <button
          className={
            tab === "orders"
              ? "btn btn-primary"
              : "btn"
          }
          onClick={() => setTab("orders")}
        >
          Bestellungen
        </button>

        <div style={{ flex: 1 }} />

        <button
          className="btn"
          onClick={() => void load()}
        >
          Aktualisieren
        </button>
      </section>

      {error && (
        <div
          className="card"
          style={{ color: "#b42318" }}
        >
          {error}
        </div>
      )}

      {tab === "stock" && (
        <>
          <section
            className="card"
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center"
            }}
          >
            <button
              className="btn btn-primary"
              onClick={() => void createMaterial()}
            >
              + Artikel
            </button>

            <input
              style={{
                ...field,
                maxWidth: 330
              }}
              placeholder="Name / Artikel-Nr. / Lager..."
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
            />

            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center"
              }}
            >
              <input
                type="checkbox"
                checked={onlyLow}
                onChange={(e) =>
                  setOnlyLow(e.target.checked)
                }
              />
              nur Unterbestand
            </label>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(620px,1.1fr) minmax(480px,.9fr)",
              gap: 12
            }}
          >
            <div className="card">
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse"
                }}
              >
                <thead>
                  <tr>
                    <th>Artikel</th>
                    <th>Lager</th>
                    <th>Bestand</th>
                    <th>Min.</th>
                    <th>Preis</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((item) => {
                    const low =
                      Number(item.stock || 0) <=
                      Number(item.minStock || 0);

                    return (
                      <tr
                        key={item.id}
                        onClick={() =>
                          setSelectedId(item.id)
                        }
                        style={{
                          cursor: "pointer",
                          background:
                            selectedId === item.id
                              ? "#eff6ff"
                              : undefined
                        }}
                      >
                        <td>
                          <b>{item.name}</b>
                          <div className="muted">
                            {item.code || "—"}
                          </div>
                        </td>

                        <td>
                          {item.location || "—"}
                        </td>

                        <td
                          style={{
                            color: low
                              ? "#b42318"
                              : undefined,
                            fontWeight: low
                              ? 700
                              : undefined
                          }}
                        >
                          {item.stock}{" "}
                          {item.unit || ""}
                        </td>

                        <td>
                          {item.minStock}
                        </td>

                        <td>
                          {Number(
                            item.priceNet || 0
                          ).toFixed(2)}{" "}
                          €
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="card">
              {!draft ? (
                <div className="muted">
                  Artikel auswählen.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: 11
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      paddingBottom: 10,
                      borderBottom:
                        "1px solid #e4eaf2"
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          fontSize: 18
                        }}
                      >
                        {draft.name}
                      </strong>

                      {dirty && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#b54708"
                          }}
                        >
                          Ungespeichert
                        </div>
                      )}
                    </div>

                    <div style={{ flex: 1 }} />

                    <button
                      className="btn"
                      onClick={() =>
                        void deleteMaterial()
                      }
                    >
                      Löschen
                    </button>

                    <button
                      className="btn btn-primary"
                      disabled={!dirty}
                      onClick={() =>
                        void saveMaterial()
                      }
                    >
                      Speichern
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: 9
                    }}
                  >
                    {[
                      ["Name", "name"],
                      ["Artikel-Nr.", "code"],
                      ["Lagerort", "location"],
                      ["Einheit", "unit"],
                      ["Lieferant", "supplier"],
                      ["Kostenstelle", "costCenter"]
                    ].map(([label, key]) => (
                      <div key={key}>
                        <label className="muted">
                          {label}
                        </label>

                        <input
                          style={field}
                          value={String(
                            (draft as any)[key] || ""
                          )}
                          onChange={(e) => {
                            setDraft({
                              ...draft,
                              [key]:
                                e.target.value
                            });
                            setDirty(true);
                          }}
                        />
                      </div>
                    ))}

                    <div>
                      <label className="muted">
                        Bestand
                      </label>

                      <input
                        type="number"
                        style={field}
                        value={draft.stock}
                        onChange={(e) => {
                          setDraft({
                            ...draft,
                            stock:
                              Number(
                                e.target.value
                              ) || 0
                          });
                          setDirty(true);
                        }}
                      />
                    </div>

                    <div>
                      <label className="muted">
                        Mindestbestand
                      </label>

                      <input
                        type="number"
                        style={field}
                        value={draft.minStock}
                        onChange={(e) => {
                          setDraft({
                            ...draft,
                            minStock:
                              Number(
                                e.target.value
                              ) || 0
                          });
                          setDirty(true);
                        }}
                      />
                    </div>

                    <div>
                      <label className="muted">
                        Preis netto (€)
                      </label>

                      <input
                        type="number"
                        step="0.01"
                        style={field}
                        value={draft.priceNet}
                        onChange={(e) => {
                          setDraft({
                            ...draft,
                            priceNet:
                              Number(
                                e.target.value
                              ) || 0
                          });
                          setDirty(true);
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 7,
                      paddingTop: 10,
                      borderTop:
                        "1px solid #e4eaf2"
                    }}
                  >
                    <button
                      className="btn"
                      disabled={dirty}
                      onClick={() =>
                        void move("IN")
                      }
                    >
                      + Eingang
                    </button>

                    <button
                      className="btn"
                      disabled={dirty}
                      onClick={() =>
                        void move("OUT")
                      }
                    >
                      − Ausgang
                    </button>

                    <button
                      className="btn"
                      disabled={dirty}
                      onClick={() =>
                        void addToOrder(draft)
                      }
                    >
                      In Bestellung übernehmen
                    </button>
                  </div>

                  <div>
                    <strong>
                      Letzte Bewegungen
                    </strong>

                    <div
                      style={{
                        display: "grid",
                        gap: 5,
                        marginTop: 7
                      }}
                    >
                      {(draft.moves || [])
                        .slice(0, 8)
                        .map((move) => (
                          <div
                            key={move.id}
                            style={{
                              display: "flex",
                              gap: 8,
                              padding: 7,
                              background:
                                "#f8fafc",
                              borderRadius: 7
                            }}
                          >
                            <b>
                              {(move.dir ||
                                move.direction) ===
                              "OUT"
                                ? "Ausgang"
                                : "Eingang"}
                            </b>

                            <span>
                              {move.qty}
                            </span>

                            <div
                              style={{
                                flex: 1
                              }}
                            />

                            <span className="muted">
                              {dateInput(
                                move.date
                              )}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {tab === "orders" && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(360px,.65fr) minmax(700px,1.35fr)",
            gap: 12
          }}
        >
          <div className="card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 10
              }}
            >
              <strong>Bestellungen</strong>

              <div style={{ flex: 1 }} />

              <button
                className="btn btn-primary"
                onClick={() =>
                  void createOrder()
                }
              >
                + Bestellung
              </button>
            </div>

            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() =>
                  setSelectedOrderId(order.id)
                }
                style={{
                  width: "100%",
                  textAlign: "left",
                  border:
                    "1px solid #e4eaf2",
                  borderRadius: 8,
                  padding: 9,
                  marginBottom: 7,
                  background:
                    selectedOrderId === order.id
                      ? "#eff6ff"
                      : "#fff",
                  cursor: "pointer"
                }}
              >
                <b>{order.number}</b>

                <div className="muted">
                  {order.supplier ||
                    "Kein Lieferant"}
                </div>

                <div className="muted">
                  {order.status} ·{" "}
                  {orderTotal(order).toFixed(2)} €
                </div>
              </button>
            ))}
          </div>

          <div className="card">
            {!orderDraft ? (
              <div className="muted">
                Bestellung auswählen.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 11
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center"
                  }}
                >
                  <strong
                    style={{
                      fontSize: 18
                    }}
                  >
                    {orderDraft.number}
                  </strong>

                  <div style={{ flex: 1 }} />

                  {orderDirty && (
                    <span
                      style={{
                        color: "#b54708",
                        fontSize: 11,
                        marginRight: 8
                      }}
                    >
                      Ungespeichert
                    </span>
                  )}

                  <button
                    className="btn"
                    onClick={() =>
                      void deleteOrder()
                    }
                  >
                    Löschen
                  </button>

                  <button
                    className="btn btn-primary"
                    disabled={!orderDirty}
                    onClick={() =>
                      void saveOrder()
                    }
                  >
                    Speichern
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr 1fr",
                    gap: 9
                  }}
                >
                  <input
                    style={field}
                    value={orderDraft.number}
                    onChange={(e) => {
                      setOrderDraft({
                        ...orderDraft,
                        number:
                          e.target.value
                      });
                      setOrderDirty(true);
                    }}
                  />

                  <input
                    style={field}
                    placeholder="Lieferant"
                    value={
                      orderDraft.supplier || ""
                    }
                    onChange={(e) => {
                      setOrderDraft({
                        ...orderDraft,
                        supplier:
                          e.target.value
                      });
                      setOrderDirty(true);
                    }}
                  />

                  <select
                    style={field}
                    value={orderDraft.status}
                    onChange={(e) => {
                      setOrderDraft({
                        ...orderDraft,
                        status:
                          e.target.value
                      });
                      setOrderDirty(true);
                    }}
                  >
                    <option value="ENTWURF">
                      Entwurf
                    </option>
                    <option value="BESTELLT">
                      Bestellt
                    </option>
                    <option value="TEILGELIEFERT">
                      Teilgeliefert
                    </option>
                    <option value="GELIEFERT">
                      Geliefert
                    </option>
                    <option value="STORNIERT">
                      Storniert
                    </option>
                  </select>

                  <input
                    type="date"
                    style={field}
                    value={dateInput(
                      orderDraft.deliveryDate
                    )}
                    onChange={(e) => {
                      setOrderDraft({
                        ...orderDraft,
                        deliveryDate:
                          e.target.value
                            ? `${e.target.value}T12:00:00.000Z`
                            : null
                      });
                      setOrderDirty(true);
                    }}
                  />
                </div>

                <div
                  style={{
                    borderTop:
                      "1px solid #e4eaf2",
                    paddingTop: 10
                  }}
                >
                  <strong>
                    Bestellpositionen
                  </strong>

                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      marginTop: 8
                    }}
                  >
                    <thead>
                      <tr>
                        <th>Artikel</th>
                        <th style={{ width: 110 }}>Menge</th>
                        <th style={{ width: 125 }}>EP netto</th>
                        <th style={{ width: 120 }}>Gesamt</th>
                        <th style={{ width: 90 }} />
                      </tr>
                    </thead>

                    <tbody>
                      {(orderDraft.lines || []).map(
                        (line) => (
                          <tr key={line.id}>
                            <td>
                              <b>{line.name}</b>
                              <div className="muted">
                                {line.code || "—"}
                              </div>
                            </td>

                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                style={field}
                                defaultValue={line.qty}
                                onBlur={(e) =>
                                  void updateOrderLine(
                                    line,
                                    {
                                      qty:
                                        Number(
                                          e.target.value
                                        ) || 0
                                    }
                                  )
                                }
                              />
                            </td>

                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                style={field}
                                defaultValue={
                                  line.priceNet
                                }
                                onBlur={(e) =>
                                  void updateOrderLine(
                                    line,
                                    {
                                      priceNet:
                                        Number(
                                          e.target.value
                                        ) || 0
                                    }
                                  )
                                }
                              />
                            </td>

                            <td>
                              <b>
                                {(
                                  Number(
                                    line.qty || 0
                                  ) *
                                  Number(
                                    line.priceNet || 0
                                  )
                                ).toFixed(2)}{" "}
                                €
                              </b>
                            </td>

                            <td>
                              <button
                                className="btn"
                                onClick={() =>
                                  void deleteOrderLine(
                                    line.id
                                  )
                                }
                              >
                                Entfernen
                              </button>
                            </td>
                          </tr>
                        )
                      )}

                      {(orderDraft.lines || []).length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="muted"
                            style={{
                              padding: 16,
                              textAlign: "center"
                            }}
                          >
                            Keine Bestellpositionen.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  <div
                    style={{
                      textAlign: "right",
                      marginTop: 10,
                      fontSize: 18,
                      fontWeight: 800
                    }}
                  >
                    Gesamt:{" "}
                    {orderTotal(
                      orderDraft
                    ).toFixed(2)}{" "}
                    €
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {loading && (
        <div className="muted">
          Lagerdaten werden geladen…
        </div>
      )}
    </div>
  );
}
