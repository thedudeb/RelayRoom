"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MouseEvent, useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";

type AccessModalProps = {
  eyebrow: string;
  title: string;
  body: string;
};

// Dialog shown on the landing page when an auth attempt is rejected (see the
// ?error handling in app/page.tsx). Closing it strips the ?error from the URL by
// replacing history with "/", so a refresh doesn't re-open it.
export function AccessModal({ eyebrow, title, body }: AccessModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  function closeModal() {
    setIsOpen(false);
    router.replace("/");
  }

  // Backdrop click closes only when the click is on the backdrop itself, not
  // bubbled up from the dialog content.
  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }

  // Close on Escape. (No dependency array: the listener is re-bound each render,
  // which is harmless here and keeps closeModal's closure current.)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div className="access-modal-backdrop" onClick={closeFromBackdrop} role="presentation">
      <section
        aria-labelledby="access-denied-title"
        aria-modal="true"
        className="access-modal"
        role="dialog"
      >
        <div className="access-modal-icon">
          <LockKeyhole aria-hidden="true" size={28} />
        </div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="access-denied-title">{title}</h2>
        <p>{body}</p>
        <div className="access-modal-actions">
          <button className="button primary" onClick={closeModal} type="button">
            Try another account
          </button>
          <Link className="button" href="/dashboard?demo=true">
            Demo login
          </Link>
        </div>
      </section>
    </div>
  );
}
