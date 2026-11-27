# WorkNest

A private, single-user record of one software professional's working day, kept as it
happens so that months later it still answers "what did I do, when, and in what order?"

## Language

### The working day

**Owner**:
The one person a WorkNest account belongs to. Every record is theirs alone.
_Avoid_: team, member, customer

**Work log**:
The record of one calendar day for the **Owner**: its **Day type**, **Meetings**,
**Ticket updates**, learning notes and an optional **Summary**. There is at most one per day.
_Avoid_: diary, journal, entry, daily report

**Day type**:
Whether a **Work log** day was a work day, a holiday or leave. Holiday and leave days
are accounted for without meetings or ticket work.
_Avoid_: day status

**Meeting**:
A named slot on a **Work log** with short notes, such as the daily stand-up. Its full
minutes, when written, are a **Minutes of meeting** note it links to.
_Avoid_: event, call

**Sprint**:
The fixed-length run of working days the **Owner**'s calendar is split into, set by
their sprint calendar. **Work logs** and the **5-15 report** are grouped by sprint.
_Avoid_: iteration, cycle

**Missing day**:
A past workday in the current **Sprint** with no **Work log**.
_Avoid_: gap, unlogged day

**Summary**:
The short AI-written account of one **Work log**. When there's no AI there's no summary;
nothing is written by code instead.
_Avoid_: recap, digest

### Tickets

**Ticket**:
A piece of work identified by a **Ticket key** in the **Owner**'s own scheme, with a
**Ticket status** and a history of **Ticket updates**.
_Avoid_: issue, story, task, Jira ticket

**Ticket key**:
The **Owner**'s own identifier for a **Ticket** (e.g. "ASU-1234"), unique within their
account only. It may name a ticket that was never opened in WorkNest.
_Avoid_: ticket id, ticket number

**Ticket status**:
Where a **Ticket** stands in the five-stage workflow: In progress, Blocked, Sent to QA,
Ready for production, Released / Done.
_Avoid_: state, stage, column

**Ticket update**:
What the **Owner** wrote about a **Ticket** on one **Work log**, stamped with the
**Ticket status** at that moment. One per ticket per day; earlier days' updates are
never changed.
_Avoid_: comment, log entry, work note

**Direct update**:
A **Ticket update** written on the ticket itself rather than inside a **Work log**.
_Avoid_: history entry, standalone note

### Tracker

**Tracker**:
The **Owner**'s queue of things to do and people to chase: **To-dos**, **Follow-ups**
and **Tracker notes**. It is where WorkNest opens after sign-in.
_Avoid_: dashboard, inbox, task list

**Tracker entry**:
Any one item in the **Tracker**: a **To-do**, a **Follow-up** or a **Tracker note**.
_Avoid_: follow-up (for the general case), item, record

**To-do**:
A **Tracker entry** for something the **Owner** must do, with an optional due date. A
to-do is either work or **Personal**.
_Avoid_: task (that name belongs to the unbuilt Tasks page), action item, reminder

**Personal to-do**:
A **To-do** that isn't work. It stays out of **Work logs**, **Summaries** and the
**5-15 report**.
_Avoid_: private to-do, sticky note (that's only how it looks)

**Follow-up**:
A **Tracker entry** that is a running conversation with one **Person** about one subject,
made of **Messages**.
_Avoid_: thread, chase, reminder, update

**Person**:
Who a **Follow-up** is with, recorded by name only. There is no contacts list.
_Avoid_: contact, assignee, stakeholder

**Message**:
One thing said in a **Follow-up**, by the **Owner** or by the **Person**, with the
**Channel** and when it was said. Messages are never removed; editing one keeps its
earlier **Revisions**.
_Avoid_: update, follow-up update, reply (unless it is the Person's)

**Channel**:
Where a **Message** was said, from the **Owner**'s own list (Slack, email, a call…).
_Avoid_: medium, source

**Reminder**:
The date by which a **Follow-up** should be chased if the **Person** hasn't replied.
A reminder dated on or before the **Owner**'s last **Message** is out of date and doesn't
count.
_Avoid_: due date (that's a **To-do**'s), nudge date

**Your turn**:
A **Follow-up** whose newest **Message** is the **Person**'s, so the **Owner** owes a reply.
_Avoid_: replied, waiting on you, needs reply

**Time to ping**:
A **Follow-up** where the **Owner** spoke last and the **Reminder** has arrived.
_Avoid_: nudge due, overdue follow-up

**Waiting on them**:
A **Follow-up** where the **Owner** spoke last and the **Reminder** hasn't arrived.
_Avoid_: waiting, pending

**Ping**:
The **Owner** chasing a **Follow-up** again, recorded as a **Message**.
_Avoid_: nudge, chase

**Needs you**:
Everything in the **Tracker** that is the **Owner**'s move now: late and due-today
**To-dos**, plus **Follow-ups** in **Your turn** or **Time to ping**.
_Avoid_: urgent, overdue, action required

**Tracker note**:
A **Tracker entry** that is a single document, kept for the record, such as **Minutes
of meeting**. It is edited in place and every earlier version stays as a **Revision**.
_Avoid_: note (alone, since **Notebook** pages are notes too), memo

**Minutes of meeting**:
A **Tracker note** holding the full minutes of a meeting, with who it was with. One
**Meeting** or several can point to it.
_Avoid_: MoM (in prose), meeting note

**Revision**:
The text of a **Message** or **Tracker note** as it stood before an edit.
_Avoid_: version, history

**Pinned**:
Starred as important, so it shows first in its list and in **Favourites**.
_Avoid_: favourite, flagged, important (except as UI copy)

**Archived**:
Put away without finishing or deleting: off the **Tracker** lists, still in history.
_Avoid_: hidden, deleted, closed

### Knowledge

**Notebook**:
A long-lived structured document of sections and pages, for knowledge the **Owner**
wants to keep.
_Avoid_: note (alone), wiki, doc

**Resource**:
A saved link, doc, tool, command or snippet in the **Owner**'s library, with a type
from their own list and tags.
_Avoid_: link, bookmark, asset

**Achievement**:
A certification, course or award on the **Owner**'s timeline, with its certificate.
_Avoid_: badge, credential

**Favourites**:
The one place that gathers everything **Pinned** across WorkNest.
_Avoid_: starred, bookmarks

### Reporting and AI

**5-15 report**:
The per-**Sprint** report of what was completed and what is blocked, written by AI from
the sprint's **Work logs** and **To-dos**, ready to paste into the **Owner**'s own doc.
_Avoid_: sprint report (in UI copy), status report, retro

**Ask**:
The chat that answers questions about the **Owner**'s own records, citing the records it
used, and proposes **Tracker** changes the **Owner** confirms.
_Avoid_: assistant, chatbot, search

**Quick log**:
Turning rough pasted text into a draft **Work log**, **To-dos** or **Follow-ups** that
the **Owner** reviews before anything is saved.
_Avoid_: import, capture, smart add

### Accounts and devices

**Admin**:
An account that may manage other accounts (statistics, password reset, erasure). It
never browses their records.
_Avoid_: superuser, moderator

**Kaizen**:
The **Owner**'s phone app. It signs in once and can see and add only **Tracker entries**
and **Resources**.
_Avoid_: mobile app, the app (ambiguous with WorkNest itself)
