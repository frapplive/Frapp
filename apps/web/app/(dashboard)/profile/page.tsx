import { Suspense } from "react";
import { ProfilePanel } from "@/components/profile/profile-panel";
import { ProfilePageSkeleton } from "@/components/profile/profile-skeleton";

export const metadata = {
  title: "Profile",
};

export default function ProfilePage() {
  return (
    // `ProfilePanel` reads `?open=` (which standing panel is open), and
    // `useSearchParams` has to sit under a Suspense boundary.
    <Suspense fallback={<ProfilePageSkeleton />}>
      <ProfilePanel />
    </Suspense>
  );
}
