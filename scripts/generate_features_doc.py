import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)

def set_cell_margins(cell, top=120, bottom=120, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def create_styled_table(doc, headers, data, header_bg='1E293B', category_color=RGBColor(37, 99, 235), col_widths=None):
    if col_widths is None:
        col_widths = [Inches(1.8), Inches(1.3), Inches(2.2), Inches(2.0)]
    
    table = doc.add_table(rows=len(data) + 1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # Header Row
    hdr_cells = table.rows[0].cells
    for idx, heading in enumerate(headers):
        cell = hdr_cells[idx]
        cell.width = col_widths[idx]
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(4)
        run = p.add_run(heading)
        run.font.name = 'Segoe UI'
        run.font.size = Pt(9.5)
        run.font.bold = True
        run.font.color.rgb = RGBColor(255, 255, 255)
        set_cell_background(cell, header_bg)
        set_cell_margins(cell, top=140, bottom=140, left=140, right=140)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

    # Data Rows
    for row_idx, row_data in enumerate(data):
        row_cells = table.rows[row_idx + 1].cells
        bg_color = 'F8FAFC' if row_idx % 2 == 1 else 'FFFFFF'
        for col_idx, cell_value in enumerate(row_data):
            cell = row_cells[col_idx]
            cell.width = col_widths[col_idx]
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(3)
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.line_spacing = 1.15
            run = p.add_run(cell_value)
            run.font.name = 'Segoe UI'
            run.font.size = Pt(9)
            if col_idx == 0:
                run.font.bold = True
                run.font.color.rgb = RGBColor(15, 23, 42)
            elif col_idx == 1:
                run.font.bold = True
                run.font.color.rgb = category_color
            else:
                run.font.color.rgb = RGBColor(51, 65, 85)
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=110, bottom=110, left=140, right=140)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

    # Table Borders
    tblPr = table._tbl.tblPr
    tblBorders = OxmlElement('w:tblBorders')
    for border_name in ['top', 'left', 'bottom', 'right', 'insideH']:
        border = OxmlElement(f'w:{border_name}')
        border.set(qn('w:val'), 'single')
        border.set(qn('w:sz'), '4')
        border.set(qn('w:space'), '0')
        border.set(qn('w:color'), 'CBD5E1')
        tblBorders.append(border)
    insideV = OxmlElement('w:insideV')
    insideV.set(qn('w:val'), 'none')
    tblBorders.append(insideV)
    tblPr.append(tblBorders)

    return table

def generate_unified_doc(output_paths):
    doc = Document()

    # Page Margins
    for section in doc.sections:
        section.top_margin = Inches(0.7)
        section.bottom_margin = Inches(0.7)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)

    # Document Header
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(3)
    run_title = p_title.add_run('⚡ Recent Platform Features & Capabilities')
    run_title.font.name = 'Segoe UI'
    run_title.font.size = Pt(18)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(15, 23, 42)

    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(16)
    run_sub = p_sub.add_run('Unified Feature Summary & Capability Matrix: LeetCode & HackerRank Dashboards — October 2026')
    run_sub.font.name = 'Segoe UI'
    run_sub.font.size = Pt(10)
    run_sub.font.color.rgb = RGBColor(100, 116, 139)

    # =========================================================================
    # SECTION 1: LEETCODE ANALYTICS DASHBOARD
    # =========================================================================
    p_sec1 = doc.add_paragraph()
    p_sec1.paragraph_format.space_before = Pt(10)
    p_sec1.paragraph_format.space_after = Pt(4)
    run_sec1 = p_sec1.add_run('1. LeetCode Analytics Dashboard — Platform Features')
    run_sec1.font.name = 'Segoe UI'
    run_sec1.font.size = Pt(13)
    run_sec1.font.bold = True
    run_sec1.font.color.rgb = RGBColor(245, 158, 11) # LeetCode Amber/Orange accent

    p_sec1_desc = doc.add_paragraph()
    p_sec1_desc.paragraph_format.space_before = Pt(0)
    p_sec1_desc.paragraph_format.space_after = Pt(8)
    run_sec1_desc = p_sec1_desc.add_run('Comprehensive analytics, automated profile synchronization, practice tracks, and student roster management for college LeetCode training programs.')
    run_sec1_desc.font.name = 'Segoe UI'
    run_sec1_desc.font.size = Pt(9.5)
    run_sec1_desc.font.color.rgb = RGBColor(71, 85, 105)

    headers = ['Feature', 'Category', 'Feature Description', 'User & Client Benefits']
    
    leetcode_data = [
        (
            "Direct Student Addition ('＋ Add Student')",
            'Student Onboarding',
            "A '＋ Add Student' button on the shared dashboard and admin portal. Opens a dedicated popup offering form entry for Student Name, LeetCode Profile URL/Username, Register Number, Email ID, Department, Section, Year, and Campus. Automatically triggers instant LeetCode stats synchronization upon saving.",
            "Coordinators can immediately enroll late or missing students during live training sessions or lab contests without requiring administrator intervention, with full stats fetched immediately."
        ),
        (
            "Structured College Dropdowns",
            'Data Accuracy',
            "Replaces free-text typing with structured dropdown menus for Department, Section / Batch, Graduation Year, and Campus, automatically populated with the college's official recorded options.",
            "Ensures standardized naming across all performance reports and eliminates typos or duplicate spelling variations (e.g., 'BCA' vs 'Bachelor of Computer Applications', 'II YEAR' vs '2nd Year')."
        ),
        (
            "Smart Department ➔ Section & Year Cascade",
            'Workflow Efficiency',
            "Selecting an academic Department dynamically updates and prioritizes the sections, graduation years, and campuses mapped specifically to that department in the dropdown lists.",
            "Speeds up student data entry by showing relevant batches first and auto-selecting when a single valid mapped option exists."
        ),
        (
            "On-The-Fly '＋ New…' Custom Entry",
            'Flexibility',
            "Selecting '＋ Add new / custom…' on any dropdown instantly prompts to register a brand-new department, section, graduation year, or campus name.",
            "Provides complete flexibility for newly introduced academic batches or disciplines without requiring prior database configuration."
        ),
        (
            "One-Click Student Editing (✏️ Pencil Icon)",
            'Data Management',
            "An inline ✏️ edit icon on every student row opens an 'Edit Student' dialog with pre-filled details, LeetCode profile links, and smart mapped dropdowns.",
            "Enables coordinators and mentors to correct typos, update roll numbers, reassign batches, or fix invalid LeetCode URLs in seconds."
        ),
        (
            "Automated LeetCode Profile & Difficulty Sync",
            'Live Analytics',
            "Asynchronous background synchronization with LeetCode to fetch live solve counts categorized by difficulty (Easy, Medium, Hard, Total), contest rating, and global ranking.",
            "Maintains an always up-to-date performance profile for every student without requiring manual spreadsheets or student-submitted forms."
        ),
        (
            "Practice Problems & Topic Tracking",
            'Curriculum Tracking',
            "Curated practice problem sets organized by Domain and Topic with optional video walkthroughs. Live tracking of completion status and distribution across batches and departments.",
            "Provides faculty with clear visibility into student concept mastery, problem completion rates, and highlights topics requiring revision."
        ),
        (
            "Monthly Solve & Activity Histograms",
            'Trend & Consistency',
            "Interactive time-series charts displaying monthly submission volume and activity trends for both individual students and entire college cohorts.",
            "Delivers instant graphical insights into student consistency, momentum, and activity drop-offs over time for proactive mentoring."
        ),
        (
            "Interactive Student Detail Drawer",
            'In-Depth Profiling',
            "Clicking any student row opens a slide-out drawer presenting global rank, contest rating, solved breakdown cards, monthly activity trend chart, and practice problem completion checklist.",
            "Allows coordinators to perform instant 1-on-1 reviews, diagnose weak areas, and inspect raw LeetCode metrics from a single pane."
        ),
        (
            "Secure Shareable Read-Only Link",
            'Access & Security',
            "Dedicated shareable view link gated by unique college share tokens. Allows coordinators, deans, and placement officers to view analytics and manage student rosters securely.",
            "Eliminates the need to grant full system administrative privileges while giving stakeholders complete visibility into training progress."
        )
    ]

    create_styled_table(doc, headers, leetcode_data, header_bg='1E293B', category_color=RGBColor(217, 119, 6))

    # =========================================================================
    # SECTION 2: HACKERRANK TRAINING & ASSESSMENT PLATFORM
    # =========================================================================
    p_sec2 = doc.add_paragraph()
    p_sec2.paragraph_format.space_before = Pt(20)
    p_sec2.paragraph_format.space_after = Pt(4)
    run_sec2 = p_sec2.add_run('2. HackerRank Training & Assessment Platform — Platform Features')
    run_sec2.font.name = 'Segoe UI'
    run_sec2.font.size = Pt(13)
    run_sec2.font.bold = True
    run_sec2.font.color.rgb = RGBColor(5, 150, 105) # HackerRank Emerald Green accent

    p_sec2_desc = doc.add_paragraph()
    p_sec2_desc.paragraph_format.space_before = Pt(0)
    p_sec2_desc.paragraph_format.space_after = Pt(8)
    run_sec2_desc = p_sec2_desc.add_run('Contest leaderboard tracking, batchwise assessments, live lab evaluations, daily practice activity logs, and single/bulk student onboarding.')
    run_sec2_desc.font.name = 'Segoe UI'
    run_sec2_desc.font.size = Pt(9.5)
    run_sec2_desc.font.color.rgb = RGBColor(71, 85, 105)

    hackerrank_data = [
        (
            "Direct Student Addition ('＋ Add Student')",
            'Student Onboarding',
            "A '＋ Add Student' button on the shared contest/college dashboard table. Opens a dedicated popup offering Single Student form entry (Name, HackerRank ID, Reg No, Email) and Bulk Paste from spreadsheets.",
            "Coordinators can immediately enroll late or missing students during live lab sessions or contests without needing administrator intervention."
        ),
        (
            "Structured College Dropdowns",
            'Data Accuracy',
            "Replaces free-text typing with structured dropdown menus for Campus, Department, Section, and Year, pre-populated with your college's official records.",
            "Ensures standardized naming across all reports and eliminates typos or duplicate spelling variations (e.g., 'CSE' vs 'Computer Science')."
        ),
        (
            "Smart Department ➔ Section Cascade",
            'Workflow Efficiency',
            "Selecting an academic Department dynamically updates and prioritizes the sections belonging specifically to that department in the dropdown list.",
            "Speeds up student data entry by showing relevant batches first while keeping the full list accessible."
        ),
        (
            "On-The-Fly '＋ New…' Custom Entry",
            'Flexibility',
            "Selecting '＋ New…' on any dropdown instantly reveals a text box to type and register a brand-new department, section, year, or campus name.",
            "Provides complete flexibility for new academic batches without being restricted to historical lists."
        ),
        (
            "One-Click Student Editing (✏️ Icon)",
            'Data Management',
            "An inline ✏️ edit icon on every student row opens a 'Check & Update Student Data' window with pre-filled details and smart dropdown menus.",
            "Enables coordinators to correct typos, update roll numbers, or adjust section allocations in seconds."
        ),
        (
            "Real-Time Analytics & Daily Logs Sync",
            'Live Reporting',
            "Adding or editing a student immediately updates summary counters (Total Students, In-Course), solve charts, score histograms, and daily practice logs.",
            "Provides instant real-time feedback and eliminates the need to refresh or regenerate reports."
        ),
        (
            "Auto-Filter Pre-Fill",
            'User Convenience',
            "If a coordinator is filtering the main table by a specific Department or Section, the '＋ Add Student' popup automatically pre-selects those active filters.",
            "Reduces repetitive data entry when onboarding multiple students into the same classroom or batch."
        ),
        (
            "Bulk Student Roster Paste",
            'Batch Operations',
            "Direct multi-row pasting from Excel / Google Sheets with automatic tab/comma column detection and automated username sanitization.",
            "Enables onboarding entire classrooms (50–100 students) in under 30 seconds with instant conflict resolution and database deduplication."
        )
    ]

    create_styled_table(doc, headers, hackerrank_data, header_bg='065F46', category_color=RGBColor(5, 150, 105))

    # =========================================================================
    # SECTION 3: UNIFIED COMPARISON & CAPABILITY MATRIX
    # =========================================================================
    p_sec3 = doc.add_paragraph()
    p_sec3.paragraph_format.space_before = Pt(20)
    p_sec3.paragraph_format.space_after = Pt(4)
    run_sec3 = p_sec3.add_run('3. Unified Platform Comparison & Capabilities Matrix')
    run_sec3.font.name = 'Segoe UI'
    run_sec3.font.size = Pt(13)
    run_sec3.font.bold = True
    run_sec3.font.color.rgb = RGBColor(30, 58, 138) # Navy Blue accent

    p_sec3_desc = doc.add_paragraph()
    p_sec3_desc.paragraph_format.space_before = Pt(0)
    p_sec3_desc.paragraph_format.space_after = Pt(8)
    run_sec3_desc = p_sec3_desc.add_run('Direct feature comparison demonstrating alignment across data entry, real-time metrics, reporting, and coordinator workflows.')
    run_sec3_desc.font.name = 'Segoe UI'
    run_sec3_desc.font.size = Pt(9.5)
    run_sec3_desc.font.color.rgb = RGBColor(71, 85, 105)

    matrix_headers = ['Capability Area', 'LeetCode Analytics Dashboard', 'HackerRank Assessment Dashboard', 'Coordinator Value']
    matrix_widths = [Inches(1.5), Inches(2.0), Inches(2.0), Inches(1.8)]
    
    matrix_data = [
        (
            'Student Onboarding',
            'Single-form modal with URL parsing & instant LeetCode stats sync',
            'Dual-mode modal: Single Student entry + Bulk Spreadsheet Paste',
            'Zero wait time for new student enrollment during live sessions'
        ),
        (
            'Smart Dropdowns & Cascades',
            'Dept ➔ Section/Batch, Year & Campus mapped with single-option auto-select',
            'Dept ➔ Section dynamic cascade with active filter pre-filling',
            'Eliminates typos and ensures standardized institutional records'
        ),
        (
            'Custom Value Entry',
            "＋ Add new / custom… on any dropdown registers new batch on-the-fly",
            "＋ New… reveals inline custom text box for immediate registration",
            'Unrestricted flexibility for newly formed classes or disciplines'
        ),
        (
            'Student Data Editing',
            '✏️ Pencil icon per row with pre-filled details & smart dropdowns',
            '✏️ Edit button per row with instant validation & update',
            'Instant corrections of student roll numbers, emails, or batch info'
        ),
        (
            'Performance Metrics Tracked',
            'Total Solved, Easy/Med/Hard breakdown, Contest Rating, Global Rank',
            'Contest Scores, Problem Completion, In-Course Progress, Daily Solves',
            'Deep visibility into both competitive rating and daily lab submissions'
        ),
        (
            'Activity & Trend Analysis',
            'Monthly activity charts & interactive slide-out student detail drawer',
            'Score distribution histograms, solve charts & daily practice log tables',
            'Visual indicators of student momentum, consistency, and drop-offs'
        ),
        (
            'Curriculum / Problem Sets',
            'Custom Domain & Topic problem sets with embedded video explanations',
            'Contest-specific challenges, test cases & leaderboard scoring',
            'Structured skill-building with immediate submission verification'
        ),
        (
            'Access & Sharing Security',
            'Token-gated shareable link for read & coordinator roster updates',
            'College-scoped and Contest-scoped tokenized share access links',
            'Safe delegation of monitoring and student updates to faculty'
        )
    ]

    create_styled_table(doc, matrix_headers, matrix_data, header_bg='1E3A8A', category_color=RGBColor(30, 58, 138), col_widths=matrix_widths)

    for output_path in output_paths:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        doc.save(output_path)
        print(f"Successfully generated: {output_path}")

if __name__ == '__main__':
    targets = [
        r'E:\Leetcode dashboard\Features_Summary_Table.docx',
        r'E:\HR-admin\Unified_Features_Summary_Table.docx',
        r'E:\HR-admin\Features_Summary_Table.docx'
    ]
    generate_unified_doc(targets)
