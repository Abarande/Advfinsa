import time
import functools
import subprocess

def retry(
    max_attempts: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    exceptions: tuple = (Exception,)
):
    """
    Decorator to retry a function up to `max_attempts` times,
    sleeping `delay *= backoff_factor` between retries on failure.
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            delay = initial_delay
            last_exc = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as e:
                    last_exc = e
                    if attempt == max_attempts:
                        # no more retries, just bubble
                        raise
                    print(
                        f"⚠️  {fn.__name__} failed (attempt {attempt}/{max_attempts}): {e!r}\n"
                        f"    retrying in {delay:.1f}s…"
                    )
                    time.sleep(delay)
                    delay *= backoff_factor
            # shouldn't get here
            raise last_exc
        return wrapper
    return decorator
