Answers to the NW Mutual Practical Test

```
Task 1 Front-end build/    responsive pricing section — see its README
Task 3 API Integration/    live currency conversion — see its README
ds/                        the Refuells design system, shared by both tasks
Test Specs/                the original brief
```

`ds/` sits here rather than inside a task folder because both tasks build on it, and one copy
means a token change cannot land in one task and not the other. Each task links it as
`../ds/styles.css`, so open the pages from the repository as it stands — an `index.html` copied
out on its own will lose its styles.

The token files are copied verbatim from the source design system so a future re-import
overwrites them cleanly. Everything outside `ds/` is task code.
