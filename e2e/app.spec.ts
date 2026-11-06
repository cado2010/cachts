// The whole app in a real browser, against the real server, book and depth-4 search.
import { expect, test, type Page } from '@playwright/test';

const square = (page: Page, name: string) => page.locator(`[data-square="${name}"]`);
const moveBox = (page: Page) => page.getByLabel('Move/FEN:');
const moveList = (page: Page) => page.getByTestId('move-list');
const toMove = (page: Page) => page.getByTestId('to-move');
const gameStatus = (page: Page) => page.getByTestId('game-status');
const dialog = (page: Page) => page.getByRole('dialog');

async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(moveBox(page)).toBeVisible({ timeout: 30_000 });
}
async function typeMove(page: Page, move: string): Promise<void> {
  await moveBox(page).fill(move);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
}
async function createBoard(page: Page, fen: string): Promise<void> {
  await moveBox(page).fill(fen);
  await page.getByRole('button', { name: 'Create Board' }).click();
  await dialog(page).getByRole('button', { name: 'OK' }).click();
  await expect(moveBox(page)).toHaveValue('');
}
const humanTurn = async (page: Page, color: 'White' | 'Black'): Promise<void> => {
  await expect(page.getByText('Cach is thinking…')).toBeHidden({ timeout: 60_000 });
  await expect(toMove(page)).toHaveText(color);
};

test('plays a typed move and gets a book reply', async ({ page }) => {
  await openApp(page);
  await typeMove(page, 'e4');
  await humanTurn(page, 'White');
  await expect(moveList(page)).toHaveText(/^1\. e4 \S+$/);
  await expect(square(page, 'e4')).toHaveAttribute('data-piece', 'wp');
  await expect(square(page, 'e2')).toHaveAttribute('data-piece', '');
});

test('plays moves by clicking, then undoes the whole turn', async ({ page }) => {
  await openApp(page);
  await square(page, 'g1').click();
  await square(page, 'f3').click();
  await humanTurn(page, 'White');
  await expect(moveList(page)).toHaveText(/^1\. Nf3 \S+$/);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(moveList(page)).toHaveText('');
  await expect(square(page, 'g1')).toHaveAttribute('data-piece', 'wN');
  await expect(toMove(page)).toHaveText('White');
});

test('shows a single error for an illegal move and recovers', async ({ page }) => {
  await openApp(page);
  await typeMove(page, 'Nf9');
  await expect(dialog(page)).toContainText('Move error: White cannot make move: Nf9, reason: InvalidFormat');
  await dialog(page).getByRole('button', { name: 'OK' }).click();
  await expect(dialog(page)).toBeHidden();
  await typeMove(page, 'e4');
  await humanTurn(page, 'White');
  await expect(moveList(page)).toContainText('1. e4');
});

test('Play Black: engine opens, board flips, click mapping follows it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Play Black' }).click();
  await expect(dialog(page)).toContainText('This will reset the current game');
  await dialog(page).getByRole('button', { name: 'OK' }).click();
  await humanTurn(page, 'Black');
  await expect(moveList(page)).toHaveText(/^1\. \S+$/);
  await expect(page.locator('[data-square]').first()).toHaveAttribute('data-square', 'h1');
  await square(page, 'b8').click();
  await square(page, 'c6').click();
  await humanTurn(page, 'Black');
  await expect(square(page, 'c6')).toHaveAttribute('data-piece', 'bN');
});

test('Create Board and Dump FEN round trip, with depth-4 search replying', async ({ page }) => {
  await openApp(page);
  const fen = 'r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P4/2N1PN2/PPP1BPPP/R1BQK2R w KQkq - 0 1';
  await createBoard(page, fen);
  await page.getByRole('button', { name: 'Dump FEN' }).click();
  await expect(moveBox(page)).toHaveValue(fen);
  await typeMove(page, 'O-O');
  await humanTurn(page, 'White');
  await expect(square(page, 'g1')).toHaveAttribute('data-piece', 'wK');
  await expect(square(page, 'f1')).toHaveAttribute('data-piece', 'wR');
  await expect(moveList(page)).toHaveText(/^1\. O-O \S+$/);
});

test('rejects an invalid FEN and keeps the game', async ({ page }) => {
  await openApp(page);
  await moveBox(page).fill('not a fen');
  await page.getByRole('button', { name: 'Create Board' }).click();
  await dialog(page).getByRole('button', { name: 'OK' }).click();
  await expect(dialog(page)).toContainText('Error while creating board from FEN');
  await dialog(page).getByRole('button', { name: 'OK' }).click();
  await expect(square(page, 'e1')).toHaveAttribute('data-piece', 'wK');
});

test('promotes by clicking, using the picker', async ({ page }) => {
  await openApp(page);
  await createBoard(page, '8/P6k/8/8/8/8/8/K7 w - -');
  await square(page, 'a7').click();
  await square(page, 'a8').click();
  await dialog(page).getByRole('button', { name: 'Knight' }).click();
  await humanTurn(page, 'White');
  await expect(square(page, 'a8')).toHaveAttribute('data-piece', 'wN');
});

test('castles by clicking the king two squares', async ({ page }) => {
  await openApp(page);
  await createBoard(page, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq -');
  await square(page, 'e1').click();
  await square(page, 'g1').click();
  await humanTurn(page, 'White');
  await expect(square(page, 'g1')).toHaveAttribute('data-piece', 'wK');
  await expect(moveList(page)).toContainText('O-O');
});

test('en passant removes the captured pawn', async ({ page }) => {
  await openApp(page);
  await createBoard(page, '4k3/8/8/3pP3/8/8/8/4K3 w - d6');
  await typeMove(page, 'exd6');
  await humanTurn(page, 'White');
  await expect(square(page, 'd5')).toHaveAttribute('data-piece', '');
  await expect(square(page, 'd6')).toHaveAttribute('data-piece', 'wp');
});

test('checkmate by the human ends the game, and Undo reopens it', async ({ page }) => {
  await openApp(page);
  await createBoard(page, '6k1/5ppp/8/8/8/8/8/R5K1 w - -');
  await typeMove(page, 'Ra8');
  await expect(gameStatus(page)).toHaveText('Check Mate [White] wins!!');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(gameStatus(page)).toHaveText('');
});

test('U1 an engine checkmate is shown straight away', async ({ page }) => {
  await openApp(page);
  // After a3, Black mates with Rb1#: the queen on g3 covers g1, g2 and h2.
  await createBoard(page, '1r4k1/8/8/8/8/6q1/P7/7K w - -');
  await expect(toMove(page)).toHaveText('White');
  await typeMove(page, 'a3');
  await expect(page.getByText('Cach is thinking…')).toBeHidden({ timeout: 60_000 });
  await expect(moveList(page)).toContainText('#');
  await expect(gameStatus(page)).toHaveText('Check Mate [Black] wins!!');
});

test('resignation is labelled as a resignation', async ({ page }) => {
  await openApp(page);
  await typeMove(page, '($)');
  await expect(gameStatus(page)).toHaveText('White resigned, Black wins');
});

test('Aid Engine Move plays both sides', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Aid Engine Move' }).click();
  await humanTurn(page, 'White');
  await expect(moveList(page)).toHaveText(/^1\. \S+ \S+$/);
});

test('W, B and the checkbox control orientation', async ({ page }) => {
  await openApp(page);
  const first = page.locator('[data-square]').first();
  await expect(first).toHaveAttribute('data-square', 'a8');
  await page.getByRole('button', { name: 'View from Black' }).click();
  await expect(first).toHaveAttribute('data-square', 'h1');
  await page.getByRole('button', { name: 'View from White' }).click();
  await expect(first).toHaveAttribute('data-square', 'a8');
  await page.getByRole('checkbox', { name: 'Always show current view' }).uncheck();
  await typeMove(page, '($)');
  await expect(first).toHaveAttribute('data-square', 'a8');
});

test('board PNG route serves an image for a live game', async ({ page, request }) => {
  let id = '';
  page.on('response', async (res) => {
    if (res.url().endsWith('/api/games') && res.request().method() === 'POST') id = (await res.json()).id;
  });
  await openApp(page);
  await expect.poll(() => id).not.toBe('');
  const res = await request.get(`/api/games/${id}/board.png`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
});

test('D6 a keyboard reload is held behind the application popup', async ({ page }) => {
  let nativeDialog = false;
  page.on('dialog', (d) => { nativeDialog = true; void d.dismiss(); });
  await openApp(page);
  await typeMove(page, 'e4');
  await expect(moveList(page)).toHaveText(/^1\. e4 \S+$/);
  const line = await moveList(page).textContent();

  await page.keyboard.press('F5');
  await expect(dialog(page)).toContainText('Reloading will lose the current game');
  await dialog(page).getByRole('button', { name: 'Keep playing' }).click();
  await expect(moveList(page)).toHaveText(line as string);

  await page.keyboard.press('Control+r');
  await dialog(page).getByRole('button', { name: 'Reload' }).click();
  await expect(moveList(page)).toHaveText('');
  await expect(dialog(page)).toBeHidden();
  await expect(square(page, 'e2')).toHaveAttribute('data-piece', 'wp');
  expect(nativeDialog).toBe(false);
});

test('D6 a real page reload keeps the game until the player confirms', async ({ page }) => {
  let nativeDialog = false;
  page.on('dialog', (d) => { nativeDialog = true; void d.dismiss(); });
  await openApp(page);
  await page.getByRole('button', { name: 'Play Black' }).click();
  await dialog(page).getByRole('button', { name: 'OK' }).click();
  await humanTurn(page, 'Black');
  await square(page, 'b8').click();
  await square(page, 'c6').click();
  await expect(moveList(page)).toHaveText(/Nc6\s*2\. \S+$/);
  const line = await moveList(page).textContent();

  await page.reload();
  await expect(dialog(page)).toContainText('The page was reloaded during a game');
  await dialog(page).getByRole('button', { name: 'Keep playing' }).click();
  await expect(moveList(page)).toHaveText(line as string);
  await expect(page.locator('[data-square]').first()).toHaveAttribute('data-square', 'h1');
  await expect(square(page, 'c6')).toHaveAttribute('data-piece', 'bN');

  await page.reload();
  await dialog(page).getByRole('button', { name: 'Start new game' }).click();
  await expect(moveList(page)).toHaveText('');
  await expect(page.locator('[data-square]').first()).toHaveAttribute('data-square', 'a8');
  expect(nativeDialog).toBe(false);
});

test('D6 reloading with nothing to lose asks nothing', async ({ page }) => {
  await openApp(page);
  await page.reload();
  await expect(moveBox(page)).toBeVisible();
  await expect(dialog(page)).toBeHidden();
});

test('fits a phone-width screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openApp(page);
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1]);
  await expect(square(page, 'e1')).toBeVisible();
});
