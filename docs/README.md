# Database Schema Overview

## Tables and Columns

### Table: classes
- **id**: bigint, not nullable, primary key
- **name**: text, not nullable
- **class_code**: text, unique

### Table: classstudents
- **id**: bigint, not nullable, primary key
- **student_id**: bigint, references students(id)
- **class_id**: bigint, references classes(id)

### Table: students
- **id**: bigint, not nullable, primary key
- **name**: text, not nullable

### Table: studentassignmentitems
- **id**: bigint, not nullable, primary key
- **student_id**: bigint, references students(id)
- **question_id**: bigint, references questions(id)
- **assignment_id**: bigint, references publishedassignments(id)
- **status**: text, not nullable, default 'not started'
- **time_limit**: interval
- **start_time**: timestamp with time zone
- **end_time**: timestamp with time zone
- **available_from**: timestamp with time zone
- **due_at**: timestamp with time zone
- **snapshot_id**: bigint, references questionsnapshots(id)

### Table: publishedassignments
- **id**: bigint, not nullable, primary key
- **class_id**: bigint, references classes(id)
- **instance_id**: bigint, references assignmentdrafts(id)
- **status**: text, not nullable, default 'Draft'
- **published_at**: timestamp with time zone
- **archived_at**: timestamp with time zone

### Table: assignmentdrafts
- **id**: bigint, not nullable, primary key
- **original_set_id**: bigint, references assignmenttemplates(id)
- **name**: text, not nullable

### Table: assignmenttemplates
- **id**: bigint, not nullable, primary key
- **name**: text, not nullable

### Table: questions
- **id**: bigint, not nullable, primary key
- **content**: text, not nullable
- **type_id**: bigint, references questiontypes(id)
- **category_id**: bigint, references questioncategories(id)
- **created_by**: bigint, references teachers(id)
- **created_at**: timestamp with time zone, default now()
- **updated_at**: timestamp with time zone, default now()

## Foreign Key Relationships

- **classstudents.student_id** references **students.id**
- **classstudents.class_id** references **classes.id**
- **studentassignmentitems.student_id** references **students.id**
- **studentassignmentitems.question_id** references **questions.id**
- **studentassignmentitems.assignment_id** references **publishedassignments.id**
- **studentassignmentitems.snapshot_id** references **questionsnapshots.id**
- **publishedassignments.class_id** references **classes.id**
- **publishedassignments.instance_id** references **assignmentdrafts.id**
- **assignmentdrafts.original_set_id** references **assignmenttemplates.id**
- **questions.type_id** references **questiontypes.id**
- **questions.category_id** references **questioncategories.id**
- **questions.created_by** references **teachers.id**
