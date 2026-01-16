# Quick Start Guide - Testing New Features

## 🚀 Quick Start (5 Minutes)

### Step 1: Rebuild Extension
```bash
cd /Users/buvan/Documents/GitHub/sql-crack
npm run compile
```
**Expected**: `webpack 5.104.1 compiled successfully`

---

### Step 2: Launch Fresh Instance
1. **Close** any open Extension Development Host windows
2. Press **F5** in VS Code
3. In the new window, **Open Folder**: `/Users/buvan/Documents/GitHub/sql-crack/examples`

---

### Step 3: Run Workspace Analysis
1. Right-click on **examples** folder in Explorer
2. Select: **"SQL Crack: Analyze Workspace Dependencies"**
3. Wait for graph to appear

---

### Step 4: Check Tabs
Look at the **top-right** of the workspace panel.

**Expected**: 4 tabs visible
- 📊 **Graph** (active)
- 🔄 **Lineage**
- 📋 **Tables**
- 💥 **Impact**

---

## ⚠️ If Tabs Are Not Visible

### Debug Mode

1. **Open Developer Tools**:
   - In Extension Development Host: Help → Toggle Developer Tools

2. **Check Console**:
   ```javascript
   // Run this in the console
   document.querySelectorAll('.view-tabs')
   ```
   - **If empty**: Tabs HTML not rendered (check for errors)
   - **If has 1 element**: Tabs exist, check if hidden via CSS
   - **If has 4+ elements**: Tabs are there but might be positioned off-screen

3. **Check Individual Tabs**:
   ```javascript
   document.querySelectorAll('.view-tab').length
   ```
   - **Expected**: 4 (Graph, Lineage, Tables, Impact)

4. **Look for Errors**:
   - Check console for red error messages
   - Note any TypeScript or JavaScript errors

---

## ✅ If Tabs Are Visible - Test Features

### Test 1: Data Lineage (2 minutes)
1. Right-click on **order_analytics** view node
2. Click **Show Upstream** 📖
3. **Expected**: Shows `orders`, `customers`, `order_items`, `products`

### Test 2: Impact Analysis (2 minutes)
1. Right-click on **customers** table node
2. Click **Analyze Impact** 💥
3. **Expected**: Shows HIGH severity impact with all dependents

### Test 3: Column Lineage (3 minutes)
1. Open **test-lineage.sql** (created in examples folder)
2. Run Workspace Analysis on this file
3. Right-click on **executive_summary** view
4. Click **Explore Table** 🔍
5. Get column lineage for **revenue_category** column
6. **Expected**: Shows transformation through all 6 stages

---

## 📋 Testing Checklist

### Tab Visibility
- [ ] 4 tabs visible in workspace panel
- [ ] Tabs are clickable
- [ ] Active tab is highlighted

### Data Lineage
- [ ] Context menu appears on right-click
- [ ] "Show Upstream" shows data sources
- [ ] "Show Downstream" shows data consumers
- [ ] "Show Full Lineage" shows both directions

### Impact Analysis
- [ ] "Analyze Impact" shows impact report
- [ ] Severity levels are appropriate
- [ ] Lists direct and transitive impacts
- [ ] Provides actionable suggestions

### Column Lineage
- [ ] Traces through views correctly
- [ ] Shows aggregation transformations
- [ ] Displays file paths and line numbers

### Debounced Search (Already Working)
- [x] Instant highlighting while typing
- [x] 600ms debounce before zoom
- [x] No camera jitter

---

## 🐛 Troubleshooting

### Issue: "Tabs not showing"
**Solution 1**: Clear cache and rebuild
```bash
npm run compile
# Press F5 to launch fresh instance
```

**Solution 2**: Check for CSS conflicts
```javascript
// In browser console
const tabs = document.querySelector('.view-tabs');
window.getComputedStyle(tabs).display  // Should be "flex"
```

**Solution 3**: Check for JavaScript errors
- Open Developer Tools Console
- Look for red error messages
- Report errors with screenshot

### Issue: "Context menu not appearing"
**Check**: Right-click on a node (not on empty space)
**Expected**: Menu with 5 options appears

### Issue: "Lineage results empty"
**Check**: Did you run Workspace Analysis first?
**Solution**: Re-run Workspace Analysis, then try again

---

## 📚 Documentation Files

1. **TESTING_NEW_FEATURES.md** - Comprehensive testing guide
2. **DETAILED_TESTING_PLAN.md** - Step-by-step test cases
3. **TEST_EXECUTION_REPORT.md** - Technical analysis and findings
4. **test-lineage.sql** - Test data with 6-stage pipeline

---

## 🎯 Success Criteria

All tests pass if:
1. ✅ Tabs are visible and clickable
2. ✅ Data lineage traces dependencies correctly
3. ✅ Impact analysis shows proper severity
4. ✅ Column lineage tracks transformations
5. ✅ No JavaScript errors in console
6. ✅ UI is responsive and smooth

---

## 📝 Report Your Results

After testing, please report:

**Working Features**:
- Debounced search ✅
- Tabs visibility: __________
- Data lineage: __________
- Impact analysis: __________
- Column lineage: __________

**Issues Found**:
1. _________________________________
2. _________________________________

**Console Errors** (if any):
```
Paste any JavaScript errors here
```

---

## 🚀 Next Steps

### If All Tests Pass:
1. ✅ Features verified and working
2. 📝 Create GitHub issue for any minor issues
3. 🎉 Ready for production use

### If Tests Fail:
1. 🐛 Document failing tests with screenshots
2. 🔍 Use Developer Tools to debug
3. 📝 Report issues with reproduction steps
4. 🔄 Re-test after fixes

---

**Need Help?**
- Check browser console (F12 → Console tab)
- Check Extension Host output (View → Output → Extension Host)
- Review test execution report: `TEST_EXECUTION_REPORT.md`

---

**Happy Testing! 🧪**

*Prepared by: AI Assistant (Droid)*
*Date: January 16, 2026*
