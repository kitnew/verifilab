# Scalability

The implemented deployment is intentionally single-instance. SQLite serializes writes, files live on one volume, and async jobs execute in the web process. This is appropriate for evaluation and small-team demos, not a production cluster.

Measure first. If sustained write contention or job latency becomes a demonstrated limit, the next architecture step would be a supported server database and an external job runner. Neither is included here, and no horizontal-scaling claim is made.
