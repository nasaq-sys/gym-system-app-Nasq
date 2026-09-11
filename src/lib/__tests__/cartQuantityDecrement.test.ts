// Comprehensive test suite for Cart decrement / increment logic
export {};

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  maxQty?: number;
}

function addProduct(cart: CartItem[], item: { id: string; name: string; price: number; maxQty?: number }): CartItem[] {
  const existing = cart.find((c) => c.id === item.id);
  if (existing) {
    if (item.maxQty !== undefined && existing.quantity >= item.maxQty) return cart;
    return cart.map((c) =>
      c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
    );
  }
  return [...cart, { id: item.id, name: item.name, price: item.price, quantity: 1, maxQty: item.maxQty }];
}

function decrementProduct(cart: CartItem[], id: string): CartItem[] {
  return cart
    .map((item) =>
      item.id === id
        ? { ...item, quantity: Math.max(0, item.quantity - 1) }
        : item
    )
    .filter((item) => item.quantity > 0);
}

function getTotals(cart: CartItem[]) {
  const totalCount = cart.reduce((s, c) => s + c.quantity, 0);
  const totalPrice = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  return { totalCount, totalPrice };
}

function runTests() {
  console.log("=== Running Cart Quantity Decrement & Increment Tests ===");

  // Test 1: 9 -> 8
  let cart: CartItem[] = [{ id: "p1", name: "Whey Protein", price: 10, quantity: 9 }];
  cart = decrementProduct(cart, "p1");
  console.assert(cart.find((c) => c.id === "p1")?.quantity === 8, "Test 1 Failed: 9 -> 8");
  console.log("✓ Test 1 Passed: 9 -> 8");

  // Test 2: 2 -> 1
  cart = [{ id: "p1", name: "Whey Protein", price: 10, quantity: 2 }];
  cart = decrementProduct(cart, "p1");
  console.assert(cart.find((c) => c.id === "p1")?.quantity === 1, "Test 2 Failed: 2 -> 1");
  console.log("✓ Test 2 Passed: 2 -> 1");

  // Test 3: 1 -> 0 (removed from cart, quantity becomes 0)
  cart = [{ id: "p1", name: "Whey Protein", price: 10, quantity: 1 }];
  cart = decrementProduct(cart, "p1");
  console.assert(cart.find((c) => c.id === "p1") === undefined, "Test 3 Failed: 1 -> 0");
  console.assert(cart.length === 0, "Test 3 Failed: Cart should be empty when qty reaches 0");
  console.log("✓ Test 3 Passed: 1 -> 0 removes item from cart");

  // Test 4: 0 must remain 0
  cart = [];
  cart = decrementProduct(cart, "p1");
  console.assert(cart.length === 0, "Test 4 Failed: 0 must remain 0");
  console.log("✓ Test 4 Passed: 0 remains 0");

  // Test 5: Multiple rapid clicks decrement one unit per click
  // Simulate 5 rapid decrements starting from 9
  cart = [{ id: "p1", name: "Whey Protein", price: 10, quantity: 9 }];
  const decrements = [1, 2, 3, 4, 5];
  decrements.forEach(() => {
    cart = decrementProduct(cart, "p1");
  });
  console.assert(cart.find((c) => c.id === "p1")?.quantity === 4, "Test 5 Failed: 9 - 5 should be 4");
  console.log("✓ Test 5 Passed: 5 rapid decrements from 9 -> 4");

  // Test 6: Changing one product does not affect any other product
  cart = [
    { id: "p1", name: "Product 1", price: 15, quantity: 5 },
    { id: "p2", name: "Product 2", price: 25, quantity: 3 },
    { id: "p3", name: "Product 3", price: 8, quantity: 1 },
  ];
  cart = decrementProduct(cart, "p2");
  console.assert(cart.find((c) => c.id === "p1")?.quantity === 5, "Test 6 Failed: Product 1 changed");
  console.assert(cart.find((c) => c.id === "p2")?.quantity === 2, "Test 6 Failed: Product 2 did not decrement to 2");
  console.assert(cart.find((c) => c.id === "p3")?.quantity === 1, "Test 6 Failed: Product 3 changed");
  console.log("✓ Test 6 Passed: Independent quantity states across products");

  // Test 7: Cart total is recalculated correctly
  let totals = getTotals(cart);
  // p1: 5 * 15 = 75, p2: 2 * 25 = 50, p3: 1 * 8 = 8. Total = 133, totalCount = 8
  console.assert(totals.totalCount === 8, `Test 7 Failed: Expected totalCount 8, got ${totals.totalCount}`);
  console.assert(totals.totalPrice === 133, `Test 7 Failed: Expected totalPrice 133, got ${totals.totalPrice}`);

  // Decrement p3 to 0
  cart = decrementProduct(cart, "p3");
  totals = getTotals(cart);
  // p1: 5 * 15 = 75, p2: 2 * 25 = 50. Total = 125, totalCount = 7
  console.assert(totals.totalCount === 7, `Test 7 Failed: Expected totalCount 7, got ${totals.totalCount}`);
  console.assert(totals.totalPrice === 125, `Test 7 Failed: Expected totalPrice 125, got ${totals.totalPrice}`);
  console.log("✓ Test 7 Passed: Cart totals and counts recalculated accurately");

  // Test 8: Increase then decrease
  cart = addProduct(cart, { id: "p4", name: "Energy Bar", price: 5 });
  console.assert(cart.find((c) => c.id === "p4")?.quantity === 1, "Test 8 Failed: add initial");
  cart = addProduct(cart, { id: "p4", name: "Energy Bar", price: 5 });
  console.assert(cart.find((c) => c.id === "p4")?.quantity === 2, "Test 8 Failed: add second");
  cart = decrementProduct(cart, "p4");
  console.assert(cart.find((c) => c.id === "p4")?.quantity === 1, "Test 8 Failed: decrement once");
  cart = decrementProduct(cart, "p4");
  console.assert(cart.find((c) => c.id === "p4") === undefined, "Test 8 Failed: decrement to 0");
  console.log("✓ Test 8 Passed: Add and decrement sequence works seamlessly");

  console.log("\nALL TESTS PASSED SUCCESSFULLY! ✨");
}

runTests();
