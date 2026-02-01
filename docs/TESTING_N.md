# Testing Guide: macOS Approvals Inbox (Milestone N)

**Date:** Feb 1, 2026  
**Status:** Ready for Testing  
**Prerequisites:** Node server running, approvals in database

---

## Quick Start

### 1. Start the Server
```bash
cd photo-agent-server
npm run dev
```

### 2. Open macOS App
- Launch `photo-agent-macos.xcodeproj` in Xcode
- Run the app (Cmd+R)
- Grant Photos library permission if prompted

### 3. Start Services
1. Click "Start" on Local Server card
2. Wait for server status to show "Running"
3. Click "Start" on Cloudflare Tunnel card (optional)

### 4. Navigate to Approvals
- Click "Approvals" in the sidebar
- Badge should show pending count (if any exist)

---

## Test Scenarios

### Scenario 1: View Pending Approvals

**Expected Behavior:**
- List shows all approvals with status "pending"
- Each card shows:
  - Intent type icon (calendar/receipt/photo)
  - Confidence percentage
  - Orange "Pending" badge
  - Summary text (truncated to 2 lines)
  - Relative timestamp ("2h ago")
- First approval auto-selected
- Detail pane shows full information

**How to Test:**
1. Open Approvals tab
2. Verify pending approvals load
3. Click different approval cards
4. Verify detail pane updates

**Pass Criteria:**
- [✓] Approvals list loads without error
- [✓] Cards show all expected information
- [✓] Selection highlighting works (blue border)
- [✓] Detail pane shows correct data for selected approval

---

### Scenario 2: Approve an Approval

**Expected Behavior:**
- Large green "Approve" button visible for pending approvals
- Button shows loading spinner during action
- Status updates to "approved"
- List refreshes automatically
- Approval moves to "Approved" filter
- Badge count decrements by 1

**How to Test:**
1. Select a pending approval
2. Click green "Approve" button
3. Wait for action to complete
4. Switch to "Approved" filter
5. Verify approval appears with green "Approved" badge

**Pass Criteria:**
- [✓] Approve button triggers action
- [✓] Loading state shows spinner
- [✓] Status updates in database
- [✓] List refreshes after action
- [✓] Approval appears in "Approved" filter
- [✓] Badge count updates correctly

---

### Scenario 3: Reject an Approval

**Expected Behavior:**
- Large red "Reject" button visible for pending approvals
- Button shows loading spinner during action
- Status updates to "rejected"
- List refreshes automatically
- Approval moves to "Rejected" filter
- Badge count decrements by 1

**How to Test:**
1. Select a pending approval
2. Click red "Reject" button
3. Wait for action to complete
4. Switch to "Rejected" filter
5. Verify approval appears with red "Rejected" badge

**Pass Criteria:**
- [✓] Reject button triggers action
- [✓] Loading state shows spinner
- [✓] Status updates in database
- [✓] List refreshes after action
- [✓] Approval appears in "Rejected" filter
- [✓] Badge count updates correctly

---

### Scenario 4: Filter Switching

**Expected Behavior:**
- Segmented picker shows 4 options: Pending/Approved/Rejected/All
- Clicking filter fetches approvals with that status
- Empty state shows when no approvals match filter
- Selection clears when switching filters

**How to Test:**
1. Click "Pending" filter → verify only pending approvals shown
2. Click "Approved" filter → verify only approved approvals shown
3. Click "Rejected" filter → verify only rejected approvals shown
4. Click "All" filter → verify all approvals shown regardless of status

**Pass Criteria:**
- [✓] Filter picker switches correctly
- [✓] List updates after filter change
- [✓] Empty states show when appropriate
- [✓] Selection state handled correctly

---

### Scenario 5: Manual Refresh

**Expected Behavior:**
- Refresh button in toolbar (circular arrow icon)
- Clicking button re-fetches approvals from server
- List updates with latest data
- Badge count updates

**How to Test:**
1. Click refresh button in toolbar
2. Verify loading state (if visible)
3. Verify list updates with latest data

**Pass Criteria:**
- [✓] Refresh button visible in toolbar
- [✓] Clicking button triggers fetch
- [✓] List updates with fresh data
- [✓] Badge count updates

---

### Scenario 6: Empty States

**Expected Behavior:**
- Each filter has custom empty state
- Shows icon, title, subtitle
- "Pending" shows green checkmark: "No Pending Approvals" / "You're all caught up!"
- "Approved" shows tray: "No Approved Actions" / "Approved actions will appear here"
- "Rejected" shows tray: "No Rejected Actions" / "Rejected actions will appear here"
- "All" shows tray: "No Approvals Yet" / "Approvals will appear as photos are analyzed"

**How to Test:**
1. Switch to filter with no matching approvals
2. Verify appropriate empty state displays

**Pass Criteria:**
- [✓] Empty state shows for each filter
- [✓] Correct icon, title, subtitle for each filter type

---

### Scenario 7: Error Handling

**Expected Behavior:**
- If server is offline, show error view
- Error view shows red triangle icon, error message, "Retry" button
- Clicking "Retry" attempts to fetch again

**How to Test:**
1. Stop the Node server
2. Open Approvals tab (or click refresh)
3. Verify error view displays
4. Click "Retry" button
5. Start server
6. Click "Retry" again
7. Verify approvals load successfully

**Pass Criteria:**
- [✓] Error view shows when server offline
- [✓] Error message is user-friendly
- [✓] Retry button works
- [✓] Recovers gracefully when server comes back online

---

### Scenario 8: Sidebar Badge

**Expected Behavior:**
- Badge on "Approvals" tab shows pending count
- Badge only shows when count > 0
- Badge updates after approve/reject actions
- Badge updates after filter changes

**How to Test:**
1. Navigate to Dashboard tab
2. Check badge on Approvals tab
3. Verify count matches pending approvals
4. Navigate to Approvals and approve one
5. Go back to Dashboard
6. Verify badge decremented by 1

**Pass Criteria:**
- [✓] Badge shows correct pending count
- [✓] Badge hides when count is 0
- [✓] Badge updates after actions
- [✓] Badge updates after refresh

---

### Scenario 9: Localhost Fallback

**Expected Behavior:**
- If tunnel URL is not set, fall back to `http://localhost:1738`
- Approvals should load successfully from localhost
- All actions should work normally

**How to Test:**
1. Ensure tunnel is NOT running (stopped)
2. Verify `appState.tunnelURL` is nil
3. Open Approvals tab
4. Verify approvals load from localhost
5. Approve/reject should work

**Pass Criteria:**
- [✓] Falls back to localhost when tunnel unavailable
- [✓] Approvals fetch succeeds
- [✓] Approve/reject actions work
- [✓] No error displayed to user

---

### Scenario 10: Master-Detail Layout

**Expected Behavior:**
- Left pane shows approval list (min width 300px)
- Right pane shows detail view (min width 400px)
- Divider is draggable to resize panes
- When no approval selected, right pane shows "Select an approval" message

**How to Test:**
1. Open Approvals tab
2. Verify HSplitView layout
3. Drag divider to resize panes
4. Deselect approval (if possible) or switch filters
5. Verify empty selection state in right pane

**Pass Criteria:**
- [✓] Master-detail layout renders correctly
- [✓] Panes are resizable
- [✓] Minimum widths enforced
- [✓] Empty selection state shows correctly

---

## Manual Database Inspection

### Check Approval Status in SQLite

```bash
cd photo-agent-server
sqlite3 data/database.db

# View all approvals
SELECT id, intentType, status, confidence, createdAt FROM approvals ORDER BY createdAt DESC LIMIT 10;

# Count by status
SELECT status, COUNT(*) FROM approvals GROUP BY status;

# View specific approval details
SELECT * FROM approvals WHERE id = 'APPROVAL_ID_HERE';
```

---

## Creating Test Approvals

If you need to create test approvals for testing:

### Option 1: Upload a Photo from iOS
1. Pair iOS app with macOS
2. Take photo of an event flyer
3. Wait for analysis to complete
4. Approval should appear automatically

### Option 2: Insert Directly into Database

```sql
INSERT INTO approvals (
  id, 
  assetId, 
  deviceId, 
  intentType, 
  extractedData, 
  proposedAction, 
  confidence, 
  status
) VALUES (
  'test-approval-' || hex(randomblob(8)),
  (SELECT id FROM assets LIMIT 1),
  'macos-test',
  'event_flyer',
  '{"summary": "Test event on Main St", "ocrText": "Join us for a party!", "reasoning": "Contains event keywords"}',
  '{"action": "create_calendar_event", "description": "Add Test Event to Calendar"}',
  0.85,
  'pending'
);
```

---

## Known Issues / Limitations

1. **No real-time updates** - Must manually refresh to see new approvals (SSE deferred to Milestone R)
2. **No edit capability** - Can only approve or reject, cannot edit extracted data (future enhancement)
3. **No image preview** - Approval detail doesn't show the original photo (future enhancement)
4. **No undo** - Cannot undo approve/reject actions (future enhancement)

---

## Success Criteria

✅ **Milestone N is complete when:**
1. Approvals list loads and displays correctly
2. All 4 filters work (Pending/Approved/Rejected/All)
3. Approve action updates status and refreshes list
4. Reject action updates status and refreshes list
5. Manual refresh works
6. Badge shows correct pending count
7. Empty states display for each filter
8. Error handling shows user-friendly messages
9. Master-detail layout is functional and resizable
10. Localhost fallback works when tunnel offline

---

## Next Milestone

**Milestone M: Calendar Integration (EventKit)**
- Create calendar events from approved event flyers
- 50 lines of Swift code
- Uses native EventKit framework
- No network calls, all local
- Immediate testable value

**After M is complete:** Full core demo ready! 🎉
