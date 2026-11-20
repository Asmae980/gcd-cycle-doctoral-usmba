# Spécification de Sécurité Firestore (Phase 0)

## 1. Invariants de Données

1. **Catalogue (`/books/{bookId}`)**:
   - Un ouvrage doit appartenir à l'une des cinq filières autorisées (`GI`, `GE`, `GIM`, `TM`, `RT`).
   - `availableCopies` doit toujours être compris entre `0` et `totalCopies`.
   - Un étudiant vérifié ne peut modifier que `availableCopies` (strictement `-1` lors d'un emprunt/réservation ou `+1` lors de l'annulation d'une réservation) et `updatedAt` (`request.time`). Seul un bibliothécaire peut créer ou éditer les métadonnées d'un ouvrage.

2. **Profils utilisateurs (`/users/{userId}`) — Isolation PII**:
   - Contient des données personnelles (`email`, `cne`, `fullName`). La lecture (`get`) est strictement limitée au propriétaire (`request.auth.uid == userId`) ou à un bibliothécaire vérifié.
   - Auto-attribution de rôle interdite : un utilisateur créant son profil ne peut se définir que `role: 'student'`, sauf s'il est déjà reconnu bibliothécaire de confiance (`isLibrarian()`).

3. **Emprunts (`/loans/{loanId}`)**:
   - Un étudiant ne peut créer un emprunt/réservation que pour son propre `studentUid == request.auth.uid`.
   - La création d'un emprunt exige l'existence de l'ouvrage référencé et la décrémentation atomique (`getAfter`) de `availableCopies` de `-1` dans le même batch.
   - Verrouillage d'état terminal : une fois `status == 'rendu'`, aucune modification ultérieure n'est autorisée.
   - Chaque action de mise à jour (`valider_retrait`, `prolonger`, `retour`, `relance`, `annuler_reservation`) est isolée avec `affectedKeys().hasOnly(...)` et impose `updatedAt == request.time`.
   - Le retour d'un livre (`status -> 'rendu'`) exige l'incrémentation atomique (`getAfter`) de `availableCopies` de `+1`.
   - Une relance interdit le doublon le même jour (`incoming().lastReminderDate != existing().lastReminderDate`).

4. **Journal d'actions (`/auditLogs/{logId}`)**:
   - Journal strictement append-only (`update` et `delete` interdits).
   - `actorUid` doit strictement correspondre à `request.auth.uid` et `createdAt == request.time`.

---

## 2. Les « Dirty Dozen » — 12 Payloads Hostiles (doivent tous renvoyer `PERMISSION_DENIED`)

1. **Usurpation d'identité (Loan Create)** : Un étudiant `uid-A` crée un emprunt avec `studentUid: 'uid-B'`.
2. **Escalade de privilèges (User Create)** : Un étudiant standard crée `/users/uid-A` avec `role: 'librarian'`.
3. **Modification de rôle (User Update)** : Un étudiant met à jour son propre `/users/uid-A` pour changer `role: 'librarian'`.
4. **Champ fantôme / Shadow Update (Book Update)** : Un étudiant envoie `{ availableCopies: 2, updatedAt: serverTimestamp, adminBackdoor: true }` sur `/books/book-1`.
5. **Emprunt sans décrémentation atomique (Loan Create)** : Un étudiant crée un document `/loans/loan-x` sans décrémenter `availableCopies` de `-1` sur `/books/book-1` dans le même batch.
6. **Saut d'état terminal (Loan Update)** : Un utilisateur ou bibliothécaire tente de modifier un emprunt déjà au statut `'rendu'`.
7. **Emprunt d'un livre inexistant (Loan Create)** : Création d'un emprunt avec `bookId: 'fake-book-999'` absent de `/books`.
8. **Horodatage falsifié (AuditLog Create)** : Création d'un log avec `createdAt` fixé dans le passé au lieu de `request.time`.
9. **Empoisonnement d'ID (Path Variable)** : Écriture sur `/books/invalid$$id_avec_1500_chars...` violant `isValidId()`.
10. **Fuite PII inter-utilisateurs (User Get)** : L'étudiant `uid-A` tente un `getDoc` sur `/users/uid-B`.
11. **Requête non filtrée (Loan List)** : L'étudiant `uid-A` tente un `getDocs(collection(db, 'loans'))` sans filtre `where('studentUid', '==', 'uid-A')`.
12. **Double relance le même jour (Loan Update)** : Un bibliothécaire tente de relancer un emprunt où `incoming().lastReminderDate == existing().lastReminderDate`.
