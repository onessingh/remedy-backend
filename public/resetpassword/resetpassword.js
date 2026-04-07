document.addEventListener("DOMContentLoaded", () => {
    const resetBtn = document.getElementById("resetPasswordBtn");
    const message = document.getElementById("message");

    resetBtn.addEventListener("click", async () => {
        const password = document.getElementById("newPassword").value.trim();
        const confirmPassword = document.getElementById("confirmPassword").value.trim();

        if (!password || !confirmPassword) {
            message.textContent = "Both fields are required.";
            return;
        }

        if (password !== confirmPassword) {
            message.textContent = "Passwords do not match.";
            return;
        }

        // 🔐 Token from URL
        const token = window.location.pathname.split("/").pop();

        // Disable button to prevent multiple clicks
        resetBtn.disabled = true;
        resetBtn.textContent = "Processing...";

        try {
            const res = await fetch(`/forgot-password/reset-password/${token}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ password }),
            });

            const data = await res.json();
            if (res.status === 200) {
                message.className = "success";
                message.textContent = data.message;
                setTimeout(() => {
                    window.location.href = "/"; // Redirect to homepage
                }, 2000);
            } else {
                message.textContent = data.message || "Reset failed";
                resetBtn.disabled = false;
                resetBtn.textContent = "Save Changes";
            }
        } catch (err) {
            console.error("Reset error:", err);
            message.textContent = "Something went wrong.";
            resetBtn.disabled = false;
            resetBtn.textContent = "Save Changes";
        }
    });
});