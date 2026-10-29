# Questions for the society (TGSECCSL)

> Version 1.1 · 2026-10-29 · **Answers received from the society (recorded below each question).**
> Each question shows **what the demo did before the answer**, then the society's **answer** (in their words, lightly cleaned), then **what it means for the app**.
> What has to change in the app, conflicts and follow-up questions: `docs/21-society-answers-impact.md`. Technical tracking: `docs/open-questions.md` (the Q-numbers in brackets). Decision: D-067.

## 1. Membership

1. **Is the "General Number" your society membership number, or the government employee number?** (Q-501)
   *Demo:* the society's own number. It is shown on every screen and form.
   **Answer:** The General Number is the society membership number. The employee number is always the government service number.
   *Means:* matches the demo. No change.
2. **How many shares must a new member buy, what is one share worth, and is there an admission fee?** (Q-506)
   *Demo:* a share is ₹100, 10 to 100 shares, no admission fee.
   **Answer:** A member can buy any number of shares. No joining fee for now, but keep a joining-fee field set to ₹0.
   *Means:* remove the 10–100 limit (minimum 1, no maximum). Keep the admission fee in the master at ₹0. Share value (₹100) not confirmed.
3. **Is a new member approved by the Secretary then the President, or by a committee resolution?** (Q-511)
   *Demo:* Secretary, then President.
   **Answer:** It goes to the Accountant, who checks all documents and service particulars and adds comments for approval by **either the Secretary or the President**. Also add **insurance** for the member: ₹200 for a member, ₹1,000 for a member with a loan. Keep a **master file** for these values with an **active status** for the current record.
   *Means:* one approval signature (Secretary **or** President), not two. Conflicts with the paper form (see doc 21). Insurance and other values become versioned master records.
4. **If the share money is cut from salary, is the person a member from approval, or from the first deduction?** (Q-510)
   *Demo:* a member from approval. The share money appears on the next month's salary-deduction list.
   **Answer:** Membership starts after approval by the society. The deductions go to the DDO through the app, or as a department-wise list sent to the DDO.
   *Means:* matches the demo.
5. **Is signing with a one-time code (OTP) on the phone acceptable, or do you need a pen signature or Aadhaar eSign?** (Q-505)
   *Demo:* current name, signing with an OTP.
   **Answer:** Use **push notification** rather than SMS, or a **WhatsApp** API, for authentication. Signing forms is **not required**: the member registers and is authenticated by the society.
   *Means:* no "Sign with OTP" step on forms; a logged-in submit is enough. OTPs (login) go by WhatsApp or push, not SMS.
6. **Which documents must a new member upload?** (Q-403)
   *Demo:* four sample document types.
   **Answer:** Aadhaar card, PAN card and service particulars.
   *Means:* three document types.
7. **Why is caste recorded, and who may see it?** (Q-406)
   *Demo:* only the Super Admin and the Accountant.
   **Answer:** Caste is mandatory, particularly for service people. These details are available for everyone to see.
   *Means:* caste becomes mandatory and visible to all staff roles. "Everyone" needs confirming (follow-up F-07).

## 2. Loans

8. **For each loan type, what are the interest rate, the largest amount and the longest repayment period?** (Q-311)
   *Demo:* Ordinary 11%, ₹5,00,000, 100 months · Education 9%, ₹3,00,000, 60 months · Salary 12%, ₹1,00,000, 24 months · Loan against deposit 10%, 90% of the deposit, 36 months.
   **Answer:** Keep a **master file** for loan products with an active status. If a product changes, create a new product record and make it active. The same values show during loan applications and fixed deposits. The loan amount is the **member's choice**. After they apply, the **Accountant checks eligibility** from the service details and existing deductions. If the request exceeds the threshold, the Accountant may **suggest a loan amount** and the interest is calculated on that. When an EMI is paid it must be **posted to the ledgers** against the loan.
   *Means:* product masters are versioned (new version, old one inactive); the demo values stay as the first version. The Accountant can counter-offer an amount. Every EMI posts to a loan ledger.
9. **How is the monthly instalment worked out?** (Q-302)
   *Demo:* a fixed part of the loan plus interest on what is still owed.
   **Answer:** Based on the number of months, the interest is added to the principal and the total is divided equally over the months. Always show the **remaining balance** and **remaining months** against the loan.
   *Means:* **flat-rate EMI** (same amount every month). Conflicts with the agreement's "reducing balance" wording (see doc 21).
10. **Salary loan: how much can a member take, and is it repaid in one cut or in instalments?** (Q-502)
    *Demo:* up to the pay earned so far, no sureties, no DDO certificate.
    **Answer:** The amount depends on the member. Eligibility is based on service particulars and existing salary deductions. Repayment is always by **monthly instalments** from salary. If the employee has loss of pay and net pay is below the EMI, the DDO deducts part and credits it to the society. The **DDO must be able to amend the EMI amount** and save it. The due amount and its **penal amount** are then calculated and added to the loan, **reminders** are sent to the member and a **dues report** is produced.
    *Means:* no fixed cap; the Accountant decides. DDO gets a "record actual deduction" screen. Shortfalls create dues + penal interest.
11. **Is the 10% share deduction for Ordinary loans also taken on other loan types?** (Q-304)
    *Demo:* Ordinary loans only.
    **Answer:** Yes, on loans only they deduct 10% share value and add the insurance too. The whole loan is not paid out: the member gets **90%** and 10% stays with the society. Check the earlier document.
    *Means:* 10% share deposit and insurance are deducted at disbursement. Which loan types it applies to needs confirming (follow-up F-03).
12. **Can a member hold more than one loan of the same type?** (Q-115)
    *Demo:* one per type, except loans against deposits (two).
    **Answer:** Yes, multiple loans of the same type are allowed. We recommend a top-up instead of a new loan of the same type.
    *Means:* allow more than one; the app suggests a top-up first.
13. **Is there a limit on how much of the take-home pay instalments may use?** (Q-503)
    *Demo:* the ratio is shown to staff and warns above 50%, but never blocks.
    **Answer:** It is the Accountant's recommendation and the approval decision.
    *Means:* matches the demo (warning only).
14. **What happens to a loan when a member retires, resigns or dies?** (Q-315)
    *Demo:* the repayment period cannot go past the retirement date.
    **Answer:** The society checks service particulars and restricts the loan amount accordingly. The loan must be completed by retirement.
    *Means:* matches the demo. Resignation and death are still unanswered (follow-up F-08).
15. **What can be offered as security besides sureties?** (Q-507)
    *Demo:* sureties, a pledged fixed deposit, or "other".
    **Answer:** All details are asked, but guarantor details are the most important. The guarantor's service particulars are also checked when assessing the loan.
    *Means:* show the surety's service particulars in the assessment.

## 3. Sureties

16. **How many loans may one member guarantee, and what if a surety retires before the loan ends?** (Q-504)
    *Demo:* two loans at a time. Retiring early only shows a warning.
    **Answer:** The guarantor's service particulars are always checked. A guarantor may stand for **more than one loan**. If the guarantor is retiring, the society checks the guarantor's **FD**; if it is sufficient, the loan goes ahead.
    *Means:* raise the limit (setting). A retiring surety needs enough FD balance to cover the guarantee.

## 4. Deposits and savings

17. **What do CRD, SRDS and RRF stand for, and how much is collected each month?** (Q-301)
    *Demo:* CRD ₹500, SRDS ₹300 and RRF ₹100 a month.
    **Answer:** CRD = Co-operative Rural Bank. SRDS = Society for Rural Development Services. RRF = Risk Reserve Fund or Replace Reserve Fund.
    *Means:* names recorded. Monthly amounts not confirmed (follow-up F-05).
18. **Fixed deposits: interest per period, smallest amount, interest method, early closure.** (Q-313)
    *Demo:* 1–2 years 7%, 2–3 years 7.25%, 3–5 years 7.5%; smallest FD ₹10,000; no early closure.
    **Answer:** Keep FD interest rates and the minimum deposit in the master file. Early withdrawal carries a **penalty %** kept in the master; calculate it on early withdrawal and deduct it from the amount. All amounts are kept in the books (ledgers).
    *Means:* add premature withdrawal with a penalty %. FD rates and minimum become versioned masters.
19. **How do savings deposits and withdrawals happen, and what interest do they earn?** (Q-312)
    *Demo:* view and statement only, at 4%.
    **Answer:** There is no savings account. Treat it as FDs.
    *Means:* remove the savings account from the app.

## 5. Monthly salary deductions (the demand sheet)

20. **On which day is the deduction list made, and what is the cut-off for new loans and transfers?** (Q-308)
    *Demo:* monthly. A transfer counts from the next list that has not been made yet.
    **Answer:** Send the department-wise list to the DDO **3 to 5 days before** salary processing; salaries are processed by the **1st of every month**. There is **no cut-off** for new loans; members can apply any time.
    *Means:* the sheet must reach DDOs around the 26th–28th (setting).
21. **When a salary deduction comes short, in what order is the money used? What happens to extra?** (Q-309)
    *Demo:* the fixed order on the recovery agreement. Extra stays with the member as credit.
    **Answer:** Let the **DDO enter the amount actually deducted** in the app and save it, or the DDO writes it on the form and sends it back and the Accountant adjusts the EMI. Show the **due amount for that month** on the record. **Interest is added for the number of days delayed** until the dues are cleared.
    *Means:* DDO recovery entry; daily penal interest on the unpaid amount. The order of heads was not answered (keep the agreement order).
22. **Are unpaid amounts carried into next month's list?** (Q-316)
    *Demo:* yes, as separate lines.
    **Answer:** No. The member clears it manually by visiting the Accounts section.
    *Means:* stop carrying arrears onto the next sheet; dues are paid at the counter.
23. **Insurance: how much, once a year or monthly, and in which month?** (Q-306)
    *Demo:* once a year in April. ₹1,000 for members with a loan, ₹200 for others.
    **Answer:** Every **12 months from the last renewal**.
    *Means:* each member has their own renewal date, not April for everyone.
24. **Are there late-payment charges?** (Q-307)
    *Demo:* none.
    **Answer:** Yes, interest is calculated.
    *Means:* penal interest on, rate in the master (follow-up F-06 for the rate).
25. **When is a member a "defaulter", and what should the notice say?** (Q-310)
    *Demo:* after 3 months in a row unpaid.
    **Answer:** **Every unpaid** month makes the member a defaulter. When a member is unpaid, the notice is issued to the **guarantor**, and the society starts charging the guarantor.
    *Means:* defaulter after 1 unpaid month; the notice goes to the sureties; surety recovery starts.

## 6. Staff and how the office works

26. **Is there one DDO per department, or more than one?** (Q-101)
    *Demo:* one per department.
    **Answer:** One DDO for each department.
27. **Is the Cashier the same person who pays out loans? Should notes be counted for every cash receipt?** (Q-509)
    *Demo:* one "Cashier" role does both, and notes are counted for every cash receipt.
    **Answer:** The Accountant handles the due payments and the DDO payments.
    *Means:* unclear whether a separate Cashier role exists (follow-up F-04).
28. **How do staff and members sign in?** (Q-103)
    *Demo:* staff user ID and password; members General No. or Employee ID with a password.
    **Answer:** Members sign in with their **mobile number** and an OTP by **push notification or WhatsApp**. Operating and admin staff have **separate logins**.
    *Means:* member login changes to mobile + OTP (no password).
29. **Which events should send a message by SMS, WhatsApp or email, and to whom?** (Q-111)
    *Demo:* simulated, in-app.
    **Answer:** WhatsApp and email.
    *Means:* no SMS. Which events: still to list (follow-up F-09).
30. **Which bank account or UPI details should members see when they report a payment? Is a screenshot required?** (Q-120)
    *Demo:* sample account details; reference required, screenshot optional.
    **Answer:** No screenshot. The society will provide a **QR code** for members to pay.
31. **Members transferred outside the Secretariat: how are deductions collected?** (Q-512)
    *Demo:* not in the demo.
    **Answer:** Generally they do not transfer.
    *Means:* keep the transfer feature but low priority.

## 7. Look, language and app

32. **Your colours and language.** (Q-008)
    *Demo:* blue, English only.
    **Answer:** Use the best colour pattern.
    *Means:* our choice. Telugu not mentioned, so English only for now.
33. **The Android app's name.** (Q-011)
    *Demo:* "TGSECCSL".
    **Answer:** Keep it the same for now.
34. **Samples of registers, the demand sheet, sanction letter, DDO recovery statement, recovery agreement, membership form (front and back).** (Q-007, Q-506)
    **Answer:** Not yet received. Still requested.
35. **How many members, departments and loans, and how long does approval take today?** (Q-407, Q-514)
    *Demo:* about 600 sample members.
    **Answer:** Around **900+ members** and about **1,200 ex-employees**. Membership approval within **48 hours**; loans **4–5 days** at most.
    *Means:* data volume is small. 48 h and 4–5 days become service-level targets (shown as "days in stage" alerts).
