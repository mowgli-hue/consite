#!/usr/bin/env bash
# Deploy v0.2 — pushes new Firestore rules to Firebase.
#
# The new screens don't require any backend redeploy (the Cloud Functions
# they use were already deployed in v0.1). Only Firestore rules changed.
#
# Usage:
#   bash deploy-v0.2.sh

set -e

echo "→ Deploying Firestore rules with v0.2 collections (deficiencies, expenses, dailyLogs, certifications)…"
firebase deploy --only firestore:rules

echo ""
echo "✓ Done. The app on your phone will use the new rules immediately."
echo ""
echo "Note: The first time you open the Compliance screen as admin, Firestore"
echo "will prompt to create a collection-group index. Click the URL it gives"
echo "you, click Create, wait ~30 seconds for it to build. Then the screen loads."
